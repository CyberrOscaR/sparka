import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bool = (value, fallback) => (value == null || value === '' ? fallback : /^(1|true|yes|si|sí)$/i.test(value));

export const config = {
  port: Number(process.env.PORT) || 3001,
  dbFile: process.env.DB_FILE || path.join(root, 'data', 'sparka.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(root, 'data', 'uploads'),
  clientDist: path.join(root, 'client', 'dist'),
  // Perfiles de ejemplo marcados como "Demo". Ponlo a false en producción.
  demoMode: bool(process.env.DEMO_MODE, true),
  // Necesario detrás de un proxy (Render, Fly, Nginx…) para detectar HTTPS y la IP real.
  trustProxy: bool(process.env.TRUST_PROXY, false),
};
