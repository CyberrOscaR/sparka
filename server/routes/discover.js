import { Router } from 'express';
import { LIMITS } from '../catalog.js';
import { transaction } from '../db.js';
import { boundingBox, compatibility, distanceKm, mutuallyEligible, parseProfile, publicProfile } from '../matching.js';
import { getMatchBetween, getPhotoUrls, getProfile, isBlockedEitherWay, pairOf, publicProfileFor } from '../store.js';
import { HttpError, parse, swipeSchema } from '../validation.js';
import { superlikesLeft } from './me.js';

const UNDO_WINDOW_MS = 10 * 60 * 1000;

export function requireCompleteProfile(db) {
  return (req, res, next) => {
    const me = getProfile(db, req.userId);
    if (!me?.completed) return res.status(403).json({ error: 'Completa tu perfil para continuar.' });
    req.me = me;
    next();
  };
}

/** Perfiles para la pila de "Descubrir", ordenados por compatibilidad. */
export function discoverFor(db, me, { limit = 20, now = Date.now(), random = Math.random } = {}) {
  const box = boundingBox(me.lat, me.lng, me.maxDistanceKm);
  const anyLng = box.lngMin < -180 || box.lngMax > 180 ? 1 : 0;
  const rows = db
    .prepare(
      `SELECT p.* FROM profiles p
       WHERE p.user_id != :me AND p.completed = 1
         AND p.lat BETWEEN :latMin AND :latMax
         AND (:anyLng = 1 OR p.lng BETWEEN :lngMin AND :lngMax)
         AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = :me AND s.target_id = p.user_id)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = :me AND b.blocked_id = p.user_id)
                                                OR (b.blocker_id = p.user_id AND b.blocked_id = :me))
         AND (p.incognito = 0 OR EXISTS (SELECT 1 FROM swipes l WHERE l.swiper_id = p.user_id AND l.target_id = :me
                                          AND l.action IN ('like', 'superlike')))
       LIMIT 3000`,
    )
    .all({ me: me.userId, ...box, anyLng });

  const filterIntentions = me.filterIntentions;
  return rows
    .map(parseProfile)
    .filter((p) => mutuallyEligible(me, p))
    .filter((p) => filterIntentions.length === 0 || filterIntentions.includes(p.intention))
    .map((p) => ({ p, d: distanceKm(me.lat, me.lng, p.lat, p.lng) }))
    .filter(({ d }) => d <= me.maxDistanceKm)
    // Un poco de azar para que el orden no sea siempre idéntico.
    .map(({ p, d }) => ({ p, rank: compatibility(me, p, d, now).score + random() * 12 }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map(({ p }) => publicProfile(p, getPhotoUrls(db, p.userId), me, now));
}

export function discoverRoutes({ db, notify, demo }) {
  const router = Router();
  const complete = requireCompleteProfile(db);

  function createMatch(meId, otherId) {
    const [a, b] = pairOf(meId, otherId);
    const now = Date.now();
    const matchId = transaction(db, () => {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO matches (user_a, user_b, created_at) VALUES (?, ?, ?)')
        .run(a, b, now);
      // Los mensajes enviados junto al like abren la conversación.
      const notes = db
        .prepare(
          `SELECT swiper_id, message, created_at FROM swipes
           WHERE ((swiper_id = ? AND target_id = ?) OR (swiper_id = ? AND target_id = ?)) AND message IS NOT NULL
           ORDER BY created_at`,
        )
        .all(a, b, b, a);
      const insert = db.prepare('INSERT INTO messages (match_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)');
      for (const n of notes) insert.run(lastInsertRowid, n.swiper_id, n.message, n.created_at);
      return Number(lastInsertRowid);
    });
    const meProfile = getProfile(db, meId);
    const otherProfile = getProfile(db, otherId);
    notify(otherId, 'match:new', { matchId, user: publicProfileFor(db, meId, otherProfile) });
    return { id: matchId, user: publicProfileFor(db, otherId, meProfile) };
  }

  router.get('/discover', complete, (req, res) => {
    res.json({ profiles: discoverFor(db, req.me), superlikesLeft: superlikesLeft(db, req.userId) });
  });

  router.post('/swipes', complete, (req, res) => {
    const { targetId, action, message } = parse(swipeSchema, req.body);
    const me = req.userId;
    if (targetId === me) throw new HttpError(400, 'No puedes darte like a ti.');
    const target = getProfile(db, targetId);
    if (!target?.completed || isBlockedEitherWay(db, me, targetId)) throw new HttpError(404, 'Este perfil ya no está disponible.');
    // Solo puedes responder a quien podrías ver en Descubrir, o a quien ya te dio like.
    const likedMe = db
      .prepare("SELECT 1 FROM swipes WHERE swiper_id = ? AND target_id = ? AND action IN ('like', 'superlike')")
      .get(targetId, me);
    if (!likedMe && (target.incognito || !mutuallyEligible(req.me, target))) {
      throw new HttpError(404, 'Este perfil ya no está disponible.');
    }
    if (db.prepare('SELECT 1 FROM swipes WHERE swiper_id = ? AND target_id = ?').get(me, targetId)) {
      throw new HttpError(409, 'Ya has respondido a este perfil.');
    }
    if (action === 'superlike' && superlikesLeft(db, me) <= 0) {
      throw new HttpError(
        429,
        `Ya has usado tus ${LIMITS.superlikesPerDay} Chispas de hoy. Se recargan cada 24 h (y siguen siendo gratis).`,
      );
    }

    db.prepare('INSERT INTO swipes (swiper_id, target_id, action, message, created_at) VALUES (?, ?, ?, ?, ?)').run(
      me,
      targetId,
      action,
      action === 'pass' ? null : message || null,
      Date.now(),
    );

    let match = null;
    if (action !== 'pass') {
      if (target.isDemo) demo?.maybeLikeBack(targetId, me, action);
      const likedBack = db
        .prepare("SELECT 1 FROM swipes WHERE swiper_id = ? AND target_id = ? AND action IN ('like', 'superlike')")
        .get(targetId, me);
      if (likedBack && !getMatchBetween(db, me, targetId)) match = createMatch(me, targetId);
      else if (!likedBack) notify(targetId, 'likes:changed', {});
    }
    res.json({ matched: Boolean(match), match, superlikesLeft: superlikesLeft(db, me) });
  });

  /** Deshacer el último swipe. Solo los recientes: así un match deshecho hace días no puede volver. */
  router.post('/swipes/undo', complete, (req, res) => {
    const last = db
      .prepare(
        'SELECT target_id, action, created_at FROM swipes WHERE swiper_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
      )
      .get(req.userId);
    if (!last || last.created_at < Date.now() - UNDO_WINDOW_MS) throw new HttpError(404, 'No hay nada que deshacer.');
    if (getMatchBetween(db, req.userId, last.target_id)) {
      throw new HttpError(409, 'Con este perfil ya tienes match. Si quieres, puedes deshacerlo desde el chat.');
    }
    db.prepare('DELETE FROM swipes WHERE swiper_id = ? AND target_id = ?').run(req.userId, last.target_id);
    if (last.action !== 'pass') notify(last.target_id, 'likes:changed', {});
    res.json({
      profile: publicProfileFor(db, last.target_id, req.me),
      superlikesLeft: superlikesLeft(db, req.userId),
    });
  });

  /** Quién te ha dado like. En Sparka esto es gratis. */
  router.get('/likes', complete, (req, res) => {
    const rows = db
      .prepare(
        `SELECT s.swiper_id, s.action, s.message, s.created_at FROM swipes s
         JOIN profiles p ON p.user_id = s.swiper_id AND p.completed = 1
         WHERE s.target_id = :me AND s.action IN ('like', 'superlike')
           AND NOT EXISTS (SELECT 1 FROM swipes mine WHERE mine.swiper_id = :me AND mine.target_id = s.swiper_id)
           AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = :me AND b.blocked_id = s.swiper_id)
                                                  OR (b.blocker_id = s.swiper_id AND b.blocked_id = :me))
         ORDER BY (s.action = 'superlike') DESC, s.created_at DESC`,
      )
      .all({ me: req.userId });
    res.json({
      likes: rows.map((r) => ({
        superlike: r.action === 'superlike',
        message: r.message,
        createdAt: r.created_at,
        profile: publicProfileFor(db, r.swiper_id, req.me),
      })),
    });
  });

  return router;
}
