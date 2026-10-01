// Consultas reutilizadas por varias rutas.
import { parseProfile, publicProfile } from './matching.js';

export function getProfile(db, userId) {
  return parseProfile(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId));
}

export function getPhotoUrls(db, userId) {
  return db
    .prepare('SELECT filename FROM photos WHERE user_id = ? ORDER BY position, id')
    .all(userId)
    .map((r) => `/uploads/${r.filename}`);
}

export function publicProfileFor(db, userId, viewer) {
  const p = getProfile(db, userId);
  if (!p) return null;
  return publicProfile(p, getPhotoUrls(db, userId), viewer);
}

export function pairOf(a, b) {
  return a < b ? [a, b] : [b, a];
}

export function getMatchBetween(db, a, b) {
  const [ua, ub] = pairOf(a, b);
  return db.prepare('SELECT * FROM matches WHERE user_a = ? AND user_b = ?').get(ua, ub);
}

/** Devuelve el match si `userId` participa en él; si no, null. */
export function getMatchFor(db, matchId, userId) {
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!m || (m.user_a !== userId && m.user_b !== userId)) return null;
  return { ...m, otherId: m.user_a === userId ? m.user_b : m.user_a };
}

export function isBlockedEitherWay(db, a, b) {
  return Boolean(
    db
      .prepare(
        'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
      )
      .get(a, b, b, a),
  );
}

export function serializeMessage(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    senderId: row.sender_id,
    body: row.body,
    flag: row.flag,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export function likesReceivedCount(db, userId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM swipes s
       JOIN profiles p ON p.user_id = s.swiper_id AND p.completed = 1
       WHERE s.target_id = :me AND s.action IN ('like', 'superlike')
         AND NOT EXISTS (SELECT 1 FROM swipes mine WHERE mine.swiper_id = :me AND mine.target_id = s.swiper_id)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = :me AND b.blocked_id = s.swiper_id)
                                                OR (b.blocker_id = s.swiper_id AND b.blocked_id = :me))`,
    )
    .get({ me: userId }).n;
}

export function unreadCount(db, userId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages m
       JOIN matches mt ON mt.id = m.match_id
       WHERE (mt.user_a = :me OR mt.user_b = :me) AND m.sender_id != :me AND m.read_at IS NULL`,
    )
    .get({ me: userId }).n;
}
