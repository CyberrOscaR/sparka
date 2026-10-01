import { Router } from 'express';
import { analyzeMessage } from '../safety.js';
import { blindAnswerSchema, idParam, parse, HttpError } from '../validation.js';
import { requireCompleteProfile } from './discover.js';

export function blindRoutes({ blind, db }) {
  const router = Router();
  const complete = requireCompleteProfile(db);

  router.get('/blind', complete, (req, res) => {
    res.json(blind.state(req.me));
  });

  router.put('/blind/answer', complete, (req, res) => {
    const { body } = parse(blindAnswerSchema, req.body);
    // Es contenido que leerá mucha gente: aquí no basta con confirmar, no se publica.
    if (analyzeMessage(body).offensive) {
      throw new HttpError(400, 'Tu respuesta parece ofensiva. Recuerda que la leerá mucha gente.');
    }
    res.json(blind.answer(req.me, body));
  });

  router.post('/blind/answers/:id/like', complete, (req, res) => {
    res.json(blind.like(req.me, idParam(req.params.id)));
  });

  router.delete('/blind/answers/:id/like', complete, (req, res) => {
    blind.unlike(req.me, idParam(req.params.id));
    res.json({ ok: true });
  });

  return router;
}
