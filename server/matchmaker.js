// Crear matches y publicar mensajes: lo comparten los swipes, "A ciegas" y el Pulso.
import { transaction } from './db.js';
import { getProfile, pairOf, publicProfileFor, serializeMessage } from './store.js';

/**
 * Crea el match entre `actorId` (quien lo provoca) y `otherId`.
 * `intro`: mensajes con los que empieza la conversación ({ senderId, body, kind, createdAt }).
 */
export function createMatch({ db, notify }, actorId, otherId, { source = 'swipe', intro = [] } = {}) {
  const [a, b] = pairOf(actorId, otherId);
  const now = Date.now();
  const matchId = transaction(db, () => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO matches (user_a, user_b, created_at, source) VALUES (?, ?, ?, ?)')
      .run(a, b, now, source);
    const insert = db.prepare('INSERT INTO messages (match_id, sender_id, body, kind, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const m of intro) insert.run(lastInsertRowid, m.senderId, m.body, m.kind ?? 'text', m.createdAt ?? now);
    return Number(lastInsertRowid);
  });
  notify(otherId, 'match:new', { matchId, source, user: publicProfileFor(db, actorId, getProfile(db, otherId)) });
  return { id: matchId, source, user: publicProfileFor(db, otherId, getProfile(db, actorId)) };
}

/** Guarda un mensaje y lo entrega en tiempo real a las dos personas del match. */
export function postMessage({ db, notify }, matchId, senderId, body, { flag = null, kind = 'text', data = null } = {}) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO messages (match_id, sender_id, body, flag, kind, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(matchId, senderId, body, flag, kind, data ? JSON.stringify(data) : null, Date.now());
  const message = serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(lastInsertRowid));
  const m = db.prepare('SELECT user_a, user_b FROM matches WHERE id = ?').get(matchId);
  notify(m.user_a, 'message:new', message);
  notify(m.user_b, 'message:new', message);
  return message;
}
