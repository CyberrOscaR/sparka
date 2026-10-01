import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  birthdate TEXT,
  gender TEXT,
  show_me TEXT NOT NULL DEFAULT '[]',
  intention TEXT,
  bio TEXT NOT NULL DEFAULT '',
  job TEXT NOT NULL DEFAULT '',
  city TEXT,
  lat REAL,
  lng REAL,
  interests TEXT NOT NULL DEFAULT '[]',
  prompts TEXT NOT NULL DEFAULT '[]',
  age_min INTEGER NOT NULL DEFAULT 18,
  age_max INTEGER NOT NULL DEFAULT 99,
  max_distance_km INTEGER NOT NULL DEFAULT 50,
  filter_intentions TEXT NOT NULL DEFAULT '[]',
  incognito INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  last_active INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profiles_geo ON profiles(completed, lat, lng);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_user ON photos(user_id, position);

CREATE TABLE IF NOT EXISTS swipes (
  swiper_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('like', 'pass', 'superlike')),
  message TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (swiper_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_swipes_target ON swipes(target_id, action);

-- user_a siempre es el id menor, para que cada pareja tenga una única fila.
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX IF NOT EXISTS idx_matches_b ON matches(user_b);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  flag TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reported_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- "A ciegas": una respuesta por persona y día a la Pregunta del Día.
CREATE TABLE IF NOT EXISTS blind_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  question_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_blind_answers_day ON blind_answers(day);

CREATE TABLE IF NOT EXISTS blind_likes (
  liker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer_id INTEGER NOT NULL REFERENCES blind_answers(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (liker_id, answer_id)
);
CREATE INDEX IF NOT EXISTS idx_blind_likes_answer ON blind_likes(answer_id);

-- Autocitas: cuestionario de gustos y valores (privado) y las citas que Sparka propone.
CREATE TABLE IF NOT EXISTS autocita_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0,
  answers TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS autocitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  reasons TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'declined' | 'expired'
  a_response TEXT,
  b_response TEXT,
  match_id INTEGER,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX IF NOT EXISTS idx_autocitas_status ON autocitas(status, created_at);
`;

// Columnas añadidas después de la primera versión (se aplican también a bases de datos existentes).
const COLUMNS = [
  ['matches', 'source', "TEXT NOT NULL DEFAULT 'swipe'"], // 'swipe' | 'blind'
  ['matches', 'closed_at', 'INTEGER'],
  ['matches', 'closed_reason', 'TEXT'], // 'pulse_no' | 'pulse_timeout'
  ['matches', 'pulse_started_at', 'INTEGER'],
  ['matches', 'pulse_a', 'TEXT'], // voto secreto de user_a: 'yes' | null
  ['matches', 'pulse_b', 'TEXT'],
  ['matches', 'last_pulse_at', 'INTEGER'],
  ['messages', 'kind', "TEXT NOT NULL DEFAULT 'text'"], // 'text' | 'system' | 'blind' | 'plan'
  ['messages', 'data', 'TEXT'], // JSON con datos extra (p. ej. el plan de "Coincidir")
  ['matches', 'coincide_started_at', 'INTEGER'],
  ['matches', 'coincide_a', 'TEXT'], // huecos secretos de user_a (JSON)
  ['matches', 'coincide_b', 'TEXT'],
];

function migrate(db) {
  for (const [table, column, definition] of COLUMNS) {
    const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Ejecuta `fn` dentro de una transacción y hace rollback si lanza. */
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
