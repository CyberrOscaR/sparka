import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export const SESSION_COOKIE = 'sparka_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 60 * 1000;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    now,
    now + SESSION_TTL_MS,
  );
  return token;
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

/** Devuelve el id de usuario de un token de sesión válido, o null. */
export function userIdFromToken(db, token) {
  if (!token) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha256(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    destroySession(db, token);
    return null;
  }
  return row.user_id;
}

export function sessionCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}

export function requireAuth(db) {
  const lastTouched = new Map();
  return (req, res, next) => {
    const userId = userIdFromToken(db, req.cookies?.[SESSION_COOKIE]);
    if (!userId) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
    req.userId = userId;
    const now = Date.now();
    if ((lastTouched.get(userId) ?? 0) < now - ACTIVITY_THROTTLE_MS) {
      lastTouched.set(userId, now);
      db.prepare('UPDATE profiles SET last_active = ? WHERE user_id = ?').run(now, userId);
    }
    next();
  };
}

/** Limitador de peticiones en memoria (suficiente para una sola instancia). */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Demasiados intentos. Prueba en unos minutos.' }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs);
  timer.unref();
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
