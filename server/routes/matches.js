import { Router } from 'express';
import { rateLimit } from '../auth.js';
import { analyzeMessage } from '../safety.js';
import { getMatchFor, getPhotoUrls, getProfile, publicProfileFor, serializeMessage } from '../store.js';
import { activityLabel } from '../matching.js';
import { HttpError, idParam, messageSchema, parse } from '../validation.js';
import { requireCompleteProfile } from './discover.js';

const PAGE_SIZE = 50;

export function matchRoutes({ db, notify, demo }) {
  const router = Router();
  const complete = requireCompleteProfile(db);
  const messageLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 40,
    key: (req) => `msg:${req.userId}`,
    message: 'Vas muy rápido. Espera un momento antes de seguir escribiendo.',
  });

  function loadMatch(req) {
    const match = getMatchFor(db, idParam(req.params.id), req.userId);
    if (!match) throw new HttpError(404, 'Este match ya no existe.');
    return match;
  }

  function insertMessage(matchId, senderId, body, flag = null) {
    const now = Date.now();
    const { lastInsertRowid } = db
      .prepare('INSERT INTO messages (match_id, sender_id, body, flag, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(matchId, senderId, body, flag, now);
    const message = serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(lastInsertRowid));
    const m = db.prepare('SELECT user_a, user_b FROM matches WHERE id = ?').get(matchId);
    notify(m.user_a, 'message:new', message);
    notify(m.user_b, 'message:new', message);
    return message;
  }

  router.get('/matches', complete, (req, res) => {
    const me = req.userId;
    const rows = db
      .prepare(
        `SELECT id, created_at, CASE WHEN user_a = :me THEN user_b ELSE user_a END AS other_id
         FROM matches WHERE user_a = :me OR user_b = :me`,
      )
      .all({ me });
    const lastMsg = db.prepare('SELECT * FROM messages WHERE match_id = ? ORDER BY id DESC LIMIT 1');
    const unread = db.prepare(
      'SELECT COUNT(*) AS n FROM messages WHERE match_id = ? AND sender_id != ? AND read_at IS NULL',
    );
    const matches = rows
      .map((r) => {
        const other = getProfile(db, r.other_id);
        const last = lastMsg.get(r.id);
        return {
          id: r.id,
          createdAt: r.created_at,
          user: {
            id: other.userId,
            name: other.name,
            age: other.age,
            photo: getPhotoUrls(db, other.userId)[0] ?? null,
            isDemo: other.isDemo,
            activity: activityLabel(other.lastActive),
          },
          lastMessage: last ? serializeMessage(last) : null,
          unread: unread.get(r.id, me).n,
        };
      })
      .sort((a, b) => (b.lastMessage?.createdAt ?? b.createdAt) - (a.lastMessage?.createdAt ?? a.createdAt));
    res.json({ matches });
  });

  router.get('/matches/:id', complete, (req, res) => {
    const match = loadMatch(req);
    res.json({ id: match.id, createdAt: match.created_at, user: publicProfileFor(db, match.otherId, req.me) });
  });

  /** Deshacer match: desaparece para las dos personas y no vuelve a aparecer en Descubrir. */
  router.delete('/matches/:id', complete, (req, res) => {
    const match = loadMatch(req);
    db.prepare('DELETE FROM matches WHERE id = ?').run(match.id);
    notify(match.otherId, 'match:removed', { matchId: match.id });
    res.json({ ok: true });
  });

  router.get('/matches/:id/messages', complete, (req, res) => {
    const match = loadMatch(req);
    const before = req.query.before ? idParam(req.query.before) : null;
    const rows = db
      .prepare(
        `SELECT * FROM messages WHERE match_id = ? AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ${PAGE_SIZE + 1}`,
      )
      .all(match.id, before, before);
    res.json({
      messages: rows.slice(0, PAGE_SIZE).reverse().map(serializeMessage),
      hasMore: rows.length > PAGE_SIZE,
    });
  });

  router.post('/matches/:id/messages', complete, messageLimiter, (req, res) => {
    const match = loadMatch(req);
    const { body, confirmed } = parse(messageSchema, req.body);
    const risk = analyzeMessage(body);
    if (risk.offensive && !confirmed) {
      // Como en la vida real: una pausa antes de decir algo hiriente.
      throw new HttpError(422, '¿Seguro que quieres enviar esto? Podría resultar ofensivo.', {
        code: 'confirm_offensive',
      });
    }
    const flag = risk.scamRisk ? 'scam' : risk.offensive ? 'offensive' : null;
    const message = insertMessage(match.id, req.userId, body, flag);

    const other = getProfile(db, match.otherId);
    if (other.isDemo && demo) {
      demo.scheduleReply(match.id, other.userId, req.userId, (matchId, senderId, text) =>
        insertMessage(matchId, senderId, text),
      );
    }
    res.status(201).json({ message });
  });

  router.post('/matches/:id/read', complete, (req, res) => {
    const match = loadMatch(req);
    const now = Date.now();
    const { changes } = db
      .prepare('UPDATE messages SET read_at = ? WHERE match_id = ? AND sender_id != ? AND read_at IS NULL')
      .run(now, match.id, req.userId);
    if (changes > 0) notify(match.otherId, 'message:read', { matchId: match.id, readAt: now });
    res.json({ ok: true });
  });

  return router;
}
