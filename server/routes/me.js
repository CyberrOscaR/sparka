import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { SESSION_COOKIE, verifyPassword } from '../auth.js';
import { LIMITS, cityById } from '../catalog.js';
import { transaction } from '../db.js';
import { isProfileComplete, nearestCity, publicProfile } from '../matching.js';
import { getPhotoUrls, getProfile, likesReceivedCount, unreadCount } from '../store.js';
import { HttpError, idParam, parse, preferencesSchema, profileUpdateSchema } from '../validation.js';

const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/** Comprueba la firma real del archivo: no nos fiamos del tipo que dice el navegador. */
function sniffImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export function superlikesLeft(db, userId) {
  const used = db
    .prepare("SELECT COUNT(*) AS n FROM swipes WHERE swiper_id = ? AND action = 'superlike' AND created_at > ?")
    .get(userId, Date.now() - 24 * 60 * 60 * 1000).n;
  return Math.max(0, LIMITS.superlikesPerDay - used);
}

export function counts(db, userId) {
  return { likes: likesReceivedCount(db, userId), unread: unreadCount(db, userId) };
}

function privateMe(db, userId) {
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
  const p = getProfile(db, userId);
  const photos = db
    .prepare('SELECT id, filename FROM photos WHERE user_id = ? ORDER BY position, id')
    .all(userId)
    .map((r) => ({ id: r.id, url: `/uploads/${r.filename}` }));
  return {
    id: user.id,
    email: user.email,
    profile: {
      name: p.name,
      birthdate: p.birthdate,
      age: p.age,
      gender: p.gender,
      showMe: p.showMe,
      intention: p.intention,
      bio: p.bio,
      job: p.job,
      city: p.city,
      interests: p.interests,
      prompts: p.prompts,
      hasLocation: p.lat != null,
      completed: p.completed,
    },
    preferences: {
      ageMin: p.ageMin,
      ageMax: p.ageMax,
      maxDistanceKm: p.maxDistanceKm,
      intentions: p.filterIntentions,
      incognito: p.incognito,
    },
    photos,
    preview: publicProfile(p, photos.map((ph) => ph.url), null),
    counts: counts(db, userId),
    superlikesLeft: superlikesLeft(db, userId),
  };
}

export function meRoutes({ db, cfg, notify, demo }) {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  });

  router.get('/me', (req, res) => {
    res.json(privateMe(db, req.userId));
  });

  router.get('/me/counts', (req, res) => {
    res.json({ ...counts(db, req.userId), superlikesLeft: superlikesLeft(db, req.userId) });
  });

  router.put('/me/profile', (req, res) => {
    const data = parse(profileUpdateSchema, req.body);
    const columns = {};
    if (data.name !== undefined) columns.name = data.name;
    if (data.birthdate !== undefined) columns.birthdate = data.birthdate;
    if (data.gender !== undefined) columns.gender = data.gender;
    if (data.showMe !== undefined) columns.show_me = JSON.stringify([...new Set(data.showMe)]);
    if (data.intention !== undefined) columns.intention = data.intention;
    if (data.bio !== undefined) columns.bio = data.bio;
    if (data.job !== undefined) columns.job = data.job;
    if (data.interests !== undefined) columns.interests = JSON.stringify(data.interests);
    if (data.prompts !== undefined) columns.prompts = JSON.stringify(data.prompts);
    if (data.location) {
      if ('city' in data.location) {
        const city = cityById.get(data.location.city);
        Object.assign(columns, { city: city.label, lat: city.lat, lng: city.lng });
      } else {
        const { lat, lng } = data.location;
        Object.assign(columns, { city: nearestCity(lat, lng).label, lat, lng });
      }
    }

    const wasComplete = getProfile(db, req.userId).completed;
    transaction(db, () => {
      const keys = Object.keys(columns);
      if (keys.length) {
        db.prepare(`UPDATE profiles SET ${keys.map((k) => `${k} = :${k}`).join(', ')} WHERE user_id = :id`).run({
          ...columns,
          id: req.userId,
        });
      }
      const complete = isProfileComplete(getProfile(db, req.userId));
      db.prepare('UPDATE profiles SET completed = ? WHERE user_id = ?').run(complete ? 1 : 0, req.userId);
    });

    if (!wasComplete && getProfile(db, req.userId).completed) demo?.onProfileCompleted(req.userId);
    res.json(privateMe(db, req.userId));
  });

  router.put('/me/preferences', (req, res) => {
    const data = parse(preferencesSchema, req.body);
    const current = getProfile(db, req.userId);
    const ageMin = data.ageMin ?? current.ageMin;
    const ageMax = data.ageMax ?? current.ageMax;
    if (ageMin > ageMax) throw new HttpError(400, 'La edad mínima no puede ser mayor que la máxima.');
    db.prepare(
      `UPDATE profiles SET age_min = ?, age_max = ?, max_distance_km = ?, filter_intentions = ?, incognito = ?
       WHERE user_id = ?`,
    ).run(
      ageMin,
      ageMax,
      data.maxDistanceKm ?? current.maxDistanceKm,
      JSON.stringify(data.intentions ?? current.filterIntentions),
      (data.incognito ?? current.incognito) ? 1 : 0,
      req.userId,
    );
    res.json(privateMe(db, req.userId));
  });

  router.post('/me/photos', upload.single('photo'), (req, res) => {
    if (!req.file) throw new HttpError(400, 'No se ha recibido ninguna foto.');
    const mime = sniffImage(req.file.buffer);
    if (!mime) throw new HttpError(400, 'Formato no válido. Usa JPG, PNG o WebP.');
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM photos WHERE user_id = ?').get(req.userId);
    if (n >= LIMITS.maxPhotos) throw new HttpError(400, `Puedes subir hasta ${LIMITS.maxPhotos} fotos.`);

    const filename = `${crypto.randomBytes(16).toString('hex')}${MIME_EXT[mime]}`;
    fs.writeFileSync(path.join(cfg.uploadDir, filename), req.file.buffer);
    const { pos } = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM photos WHERE user_id = ?').get(req.userId);
    db.prepare('INSERT INTO photos (user_id, filename, position, created_at) VALUES (?, ?, ?, ?)').run(
      req.userId,
      filename,
      pos,
      Date.now(),
    );
    res.status(201).json(privateMe(db, req.userId));
  });

  router.delete('/me/photos/:id', async (req, res) => {
    const id = idParam(req.params.id);
    const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!photo) throw new HttpError(404, 'Foto no encontrada.');
    db.prepare('DELETE FROM photos WHERE id = ?').run(id);
    await fs.promises.rm(path.join(cfg.uploadDir, photo.filename), { force: true });
    res.json(privateMe(db, req.userId));
  });

  /** Mueve una foto a la primera posición (foto principal). */
  router.post('/me/photos/:id/main', (req, res) => {
    const id = idParam(req.params.id);
    const ids = db.prepare('SELECT id FROM photos WHERE user_id = ? ORDER BY position, id').all(req.userId).map((r) => r.id);
    if (!ids.includes(id)) throw new HttpError(404, 'Foto no encontrada.');
    const ordered = [id, ...ids.filter((x) => x !== id)];
    const update = db.prepare('UPDATE photos SET position = ? WHERE id = ?');
    transaction(db, () => ordered.forEach((photoId, i) => update.run(i, photoId)));
    res.json(privateMe(db, req.userId));
  });

  router.delete('/me', async (req, res) => {
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
    if (!(await verifyPassword(String(req.body?.password ?? ''), user.password_hash))) {
      throw new HttpError(403, 'La contraseña no es correcta.');
    }
    const files = db.prepare('SELECT filename FROM photos WHERE user_id = ?').all(req.userId);
    const partners = db
      .prepare('SELECT id, CASE WHEN user_a = ? THEN user_b ELSE user_a END AS other FROM matches WHERE user_a = ? OR user_b = ?')
      .all(req.userId, req.userId, req.userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
    await Promise.all(files.map((f) => fs.promises.rm(path.join(cfg.uploadDir, f.filename), { force: true })));
    for (const m of partners) notify(m.other, 'match:removed', { matchId: m.id });
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return router;
}
