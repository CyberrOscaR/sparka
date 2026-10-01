import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { requireAuth } from './auth.js';
import { createAutocitas } from './autocitas.js';
import { createBlind } from './blind.js';
import { createCoincide } from './coincide.js';
import { CITIES, GENDERS, INTENTIONS, INTERESTS, LIMITS, PROMPTS, REPORT_REASONS } from './catalog.js';
import { config as defaultConfig } from './config.js';
import { openDb } from './db.js';
import { createDemo, ensureDemoAutocitaProfiles, hasDemoProfiles, seedDemoProfiles } from './demo.js';
import { createPulse } from './pulse.js';
import { attachRealtime } from './realtime.js';
import { authRoutes } from './routes/auth.js';
import { autocitaRoutes } from './routes/autocitas.js';
import { blindRoutes } from './routes/blind.js';
import { discoverRoutes } from './routes/discover.js';
import { matchRoutes } from './routes/matches.js';
import { meRoutes } from './routes/me.js';
import { safetyRoutes } from './routes/safety.js';
import { HttpError } from './validation.js';

export function createApp(overrides = {}) {
  const cfg = { ...defaultConfig, ...overrides };
  const db = overrides.db ?? openDb(cfg.dbFile);
  fs.mkdirSync(cfg.uploadDir, { recursive: true });
  if (cfg.demoMode && !hasDemoProfiles(db)) seedDemoProfiles(db);
  if (cfg.demoMode) ensureDemoAutocitaProfiles(db);

  const app = express();
  if (cfg.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const server = http.createServer(app);
  const { io, notify } = attachRealtime(server, db);
  // Los servicios se referencian entre sí a través de ctx (el demo usa blind y pulse, y viceversa).
  const ctx = { db, cfg, notify };
  ctx.blind = createBlind(ctx);
  ctx.pulse = createPulse(ctx);
  ctx.coincide = createCoincide(ctx);
  ctx.autocitas = createAutocitas(ctx);
  ctx.demo = cfg.demoMode
    ? createDemo(ctx, {
        replyDelayMs: cfg.demoReplyDelayMs,
        random: cfg.demoRandom,
        blindLikeDelaysMs: cfg.demoBlindLikeDelaysMs,
      })
    : null;
  const { demo } = ctx;

  // Revisa Pulsos caducados y conversaciones en silencio cada 5 minutos.
  const sweepTimer = setInterval(() => ctx.pulse.sweep(), 5 * 60 * 1000);
  sweepTimer.unref();

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/meta', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      genders: GENDERS,
      intentions: INTENTIONS,
      interests: INTERESTS,
      prompts: PROMPTS,
      cities: CITIES.map(({ id, label, country }) => ({ id, label, country })),
      reportReasons: REPORT_REASONS,
      limits: LIMITS,
      demoMode: cfg.demoMode,
    });
  });
  app.use('/api/auth', authRoutes(ctx));
  app.use(
    '/api',
    requireAuth(db),
    meRoutes(ctx),
    discoverRoutes(ctx),
    blindRoutes(ctx),
    autocitaRoutes(ctx),
    matchRoutes(ctx),
    safetyRoutes(ctx),
  );
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

  // fallthrough: false → una foto que no existe da 404 (y no la página de la web).
  app.use('/uploads', express.static(cfg.uploadDir, { maxAge: '30d', immutable: true, index: false, fallthrough: false }));

  // En producción, el mismo servidor sirve la web compilada (npm run build).
  if (fs.existsSync(path.join(cfg.clientDist, 'index.html'))) {
    app.use(express.static(cfg.clientDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(cfg.clientDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'La foto pesa demasiado (máx. 6 MB).' : 'No se pudo subir la foto.';
      return res.status(400).json({ error: msg });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La petición es demasiado grande.' });
    // Errores de middlewares (p. ej. un archivo estático que ya no existe).
    if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: 'No encontrado.' });
    console.error(err);
    res.status(500).json({ error: 'Algo ha fallado. Inténtalo de nuevo.' });
  });

  function close() {
    clearInterval(sweepTimer);
    demo?.stop();
    io.close();
    server.close();
    db.close();
  }

  return { app, server, io, db, ctx, close };
}
