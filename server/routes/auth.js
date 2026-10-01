import { Router } from 'express';
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  hashPassword,
  rateLimit,
  sessionCookieOptions,
  verifyPassword,
} from '../auth.js';
import { transaction } from '../db.js';
import { HttpError, credentialsSchema, parse } from '../validation.js';

// Hash fijo para que el login tarde lo mismo exista o no el email.
const DUMMY_HASH = await hashPassword('sparka-dummy-password');

export function authRoutes({ db, cfg }) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: cfg.authRateLimit ?? 30 });

  function startSession(req, res, userId) {
    res.cookie(SESSION_COOKIE, createSession(db, userId), sessionCookieOptions(req));
  }

  router.post('/register', limiter, async (req, res) => {
    const { email, password } = parse(credentialsSchema, req.body);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'Ya existe una cuenta con ese email.');
    }
    const hash = await hashPassword(password);
    const now = Date.now();
    let userId;
    try {
      userId = transaction(db, () => {
        const { lastInsertRowid } = db
          .prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)')
          .run(email, hash, now);
        db.prepare('INSERT INTO profiles (user_id, last_active) VALUES (?, ?)').run(lastInsertRowid, now);
        return Number(lastInsertRowid);
      });
    } catch (err) {
      if (/UNIQUE/.test(err.message)) throw new HttpError(409, 'Ya existe una cuenta con ese email.');
      throw err;
    }
    startSession(req, res, userId);
    res.status(201).json({ ok: true });
  });

  router.post('/login', limiter, async (req, res) => {
    const { email, password } = parse(credentialsSchema, req.body);
    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    // Las cuentas demo no tienen contraseña utilizable.
    const usable = Boolean(user?.password_hash.startsWith('scrypt$'));
    const valid = await verifyPassword(password, usable ? user.password_hash : DUMMY_HASH);
    if (!usable || !valid) throw new HttpError(401, 'Email o contraseña incorrectos.');
    startSession(req, res, user.id);
    res.json({ ok: true });
  });

  router.post('/logout', (req, res) => {
    destroySession(db, req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return router;
}
