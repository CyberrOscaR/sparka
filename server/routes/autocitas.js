import { Router } from 'express';
import { autocitaProfileSchema, autocitaResponseSchema, idParam, parse } from '../validation.js';
import { requireCompleteProfile } from './discover.js';

export function autocitaRoutes({ db, autocitas }) {
  const router = Router();
  const complete = requireCompleteProfile(db);

  router.get('/autocitas', complete, (req, res) => {
    res.json(autocitas.state(req.userId));
  });

  /** Guardar el cuestionario (y activar o desactivar las Autocitas). */
  router.put('/autocitas', complete, (req, res) => {
    res.json(autocitas.save(req.userId, parse(autocitaProfileSchema, req.body)));
  });

  router.post('/autocitas/:id/respond', complete, (req, res) => {
    const { answer } = parse(autocitaResponseSchema, req.body);
    res.json(autocitas.respond(req.userId, idParam(req.params.id), answer));
  });

  return router;
}
