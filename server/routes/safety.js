import { Router } from 'express';
import { getMatchBetween, getProfile } from '../store.js';
import { HttpError, idParam, parse, reportSchema } from '../validation.js';

export function safetyRoutes({ db, notify }) {
  const router = Router();

  function block(blockerId, blockedId) {
    db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(
      blockerId,
      blockedId,
      Date.now(),
    );
    const match = getMatchBetween(db, blockerId, blockedId);
    if (match) {
      db.prepare('DELETE FROM matches WHERE id = ?').run(match.id);
      notify(blockedId, 'match:removed', { matchId: match.id });
    }
  }

  function target(req) {
    const id = idParam(req.params.id);
    if (id === req.userId) throw new HttpError(400, 'No puedes hacer esto contigo.');
    if (!getProfile(db, id)) throw new HttpError(404, 'Este perfil ya no existe.');
    return id;
  }

  router.post('/users/:id/block', (req, res) => {
    block(req.userId, target(req));
    res.json({ ok: true });
  });

  /** Denunciar siempre bloquea también, para que no tengas que volver a verle. */
  router.post('/users/:id/report', (req, res) => {
    const id = target(req);
    const { reason, details } = parse(reportSchema, req.body);
    db.prepare('INSERT INTO reports (reporter_id, reported_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?)').run(
      req.userId,
      id,
      reason,
      details,
      Date.now(),
    );
    block(req.userId, id);
    res.json({ ok: true });
  });

  return router;
}
