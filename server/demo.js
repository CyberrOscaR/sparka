// Modo demo: perfiles de ejemplo, siempre marcados como "Demo" en la interfaz,
// para que la app no esté vacía al probarla. Desactívalo en producción (DEMO_MODE=false).
import { questionForDay } from './blind.js';
import { CITIES, INTERESTS, PROMPTS, interestById, promptById } from './catalog.js';
import { transaction } from './db.js';
import { distanceKm, mutuallyEligible, parseProfile } from './matching.js';
import { getMatchFor, getProfile } from './store.js';

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = {
  mujer: ['Lucía', 'Martina', 'Sofía', 'Valentina', 'Camila', 'Paula', 'Daniela', 'Julia', 'Carla', 'Elena', 'Alba', 'Irene', 'Sara', 'Marta', 'Isabella', 'Renata', 'Mariana', 'Ximena', 'Abril', 'Luna', 'Olivia', 'Emma', 'Victoria', 'Natalia'],
  hombre: ['Mateo', 'Hugo', 'Leo', 'Martín', 'Pablo', 'Daniel', 'Alejandro', 'Diego', 'Santiago', 'Sebastián', 'Nicolás', 'Tomás', 'Lucas', 'Gabriel', 'Adrián', 'Javier', 'Andrés', 'Emiliano', 'Bruno', 'Marcos', 'Iván', 'Rodrigo', 'Joaquín', 'Álvaro'],
  no_binario: ['Alex', 'Sam', 'Noa', 'Andy', 'Cris', 'Dani', 'Ariel', 'Robin', 'Kai', 'Eli'],
};

const JOBS = ['Diseño UX', 'Ingeniería de software', 'Enfermería', 'Arquitectura', 'Docencia', 'Marketing digital', 'Fotografía', 'Medicina', 'Periodismo', 'Cocina profesional', 'Psicología', 'Derecho', 'Veterinaria', 'Música', 'Mi propio negocio', 'Investigación', 'Fisioterapia', 'Traducción', 'Ciencia de datos', 'Producción audiovisual'];

const BIOS = [
  'Curiosidad infinita y cero paciencia para los planes aburridos.',
  'Medio nómada, medio casero. Depende del día y del tiempo.',
  'Busco a alguien con quien probar todos los restaurantes raros de la ciudad.',
  'Si me hablas de tu serie favorita, te escucho durante horas.',
  'Fan de los domingos lentos y de los viajes improvisados.',
  'Me tomo muy en serio el café y muy poco en serio a mí.',
  'Hago fotos a los atardeceres como si fuera el primero que veo.',
  'Intentando leer más y mirar menos el móvil (voy perdiendo).',
  'Amante de los perros, la buena música y las conversaciones largas.',
  'Aquí para conocer gente auténtica. Sin juegos raros.',
  'Mis amistades dicen que doy los mejores abrazos. Compruébalo.',
  'De los que bailan aunque no sepan. Sobre todo si no saben.',
  'Cocino mejor de lo que escribo bios.',
  'Montaña los sábados, sofá los domingos. Equilibrio.',
  'Siempre llevo un libro en la mochila por si acaso.',
  'Te recomendaré podcasts que no me has pedido.',
  'Optimista profesional y coleccionista de planes.',
  'Trabajo mucho, me río más. Busco complicidad.',
  'Si tienes una playlist para cada momento, ya me caes bien.',
  'Me gustan las personas que preguntan "¿y tú?".',
];

const ANSWERS = {
  domingo: ['Brunch largo, mercadillo y siesta sin culpa.', 'Ruta por la montaña y terminar con unas tapas.', 'Libro, café y cero planes.', 'Cocinar algo nuevo con buena música de fondo.', 'Bici por la ciudad hasta encontrar un sitio nuevo.'],
  reir: ['Los audios de mi abuela.', 'Los memes de gatos a las 2 de la mañana.', 'Mis propios chistes malos (alguien tiene que reírse).', 'Las pelis malas de ciencia ficción.', 'La gente que baila sin vergüenza.'],
  enamoro: ['…me recomienda un libro y luego quiere comentarlo.', '…se ríe fuerte y sin filtro.', '…es amable con los camareros.', '…tiene curiosidad por todo.', '…me manda canciones sin motivo.'],
  impopular: ['La piña en la pizza está buenísima.', 'Las segundas partes a veces son mejores.', 'Madrugar un sábado merece la pena.', 'El café con hielo es mejor que el caliente.', 'Las series deberían tener tres temporadas como máximo.'],
  talento: ['Adivino el final de cualquier película.', 'Hago la mejor tortilla de mi barrio.', 'Me sé todas las capitales del mundo.', 'Puedo dormir en cualquier sitio.', 'Imito acentos fatal pero con muchas ganas.'],
  primera_cita: ['Un café que se convierte en cena sin darnos cuenta.', 'Paseo al atardecer y helado.', 'Un mercado de comida y probar de todo.', 'Un concierto pequeño de alguien que no conozcamos.', 'Una exposición y debatir cuál es la peor obra.'],
  aburrir: ['Siempre tengo un plan B (y C).', 'Conozco los mejores sitios escondidos de la ciudad.', 'Tengo conversación para horas.', 'Me apunto a casi todo.', 'Hago playlists para cada momento.'],
  karaoke: ['"Bailando", sin dudarlo.', '"Despacito", lo siento.', '"Bohemian Rhapsody", con coreografía.', 'Cualquiera de Rosalía.', '"La Bicicleta", y si es a dúo, mejor.'],
  espontaneo: ['Comprar un billete de tren el mismo día y acabar en otra ciudad.', 'Apuntarme a clases de tango sin saber bailar.', 'Bañarme en el mar en diciembre.', 'Adoptar a mi perro en un día.', 'Cantar en un micro abierto.'],
  corazon: ['…me cocinas algo, aunque salga mal.', '…me cuentas tu peor cita con humor.', '…te gustan los planes tranquilos tanto como las aventuras.', '…me escribes tú primero.', '…sabes escuchar.'],
  banderas: ['Pide perdón cuando se equivoca.', 'Conserva amistades de hace muchos años.', 'Respeta los tiempos de cada persona.', 'Se emociona hablando de lo que le apasiona.', 'Responde a los mensajes (aunque tarde).'],
  aprendiendo: ['A tocar la guitarra (despacio).', 'Italiano, para el próximo viaje.', 'A hacer pan de masa madre.', 'A decir que no sin sentirme culpable.', 'Cerámica, y ya tengo tres tazas torcidas.'],
};

// Cada ciudad recibe la misma mezcla para que cualquier persona nueva vea perfiles.
const CITY_MIX = [
  ['mujer', ['hombre']],
  ['mujer', ['hombre', 'mujer', 'no_binario']],
  ['mujer', ['mujer']],
  ['mujer', ['hombre', 'no_binario']],
  ['hombre', ['mujer']],
  ['hombre', ['mujer', 'hombre', 'no_binario']],
  ['hombre', ['hombre']],
  ['hombre', ['mujer']],
  ['no_binario', ['mujer', 'hombre', 'no_binario']],
];

const INTENTION_WEIGHTS = [
  ['serio', 3],
  ['sin_prisa', 3],
  ['casual', 2],
  ['amistad', 1],
  ['descubriendo', 2],
];

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function pickMany(rand, list, n) {
  const copy = [...list];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

function weighted(rand, entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[0][0];
}

export function hasDemoProfiles(db) {
  return Boolean(db.prepare('SELECT 1 FROM profiles WHERE is_demo = 1 LIMIT 1').get());
}

export function removeDemoProfiles(db) {
  db.prepare('DELETE FROM users WHERE id IN (SELECT user_id FROM profiles WHERE is_demo = 1)').run();
}

export function seedDemoProfiles(db, { seed = 42, now = Date.now() } = {}) {
  const rand = mulberry32(seed);
  const insertUser = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)');
  const insertProfile = db.prepare(`
    INSERT INTO profiles (user_id, name, birthdate, gender, show_me, intention, bio, job, city, lat, lng,
      interests, prompts, age_min, age_max, max_distance_km, is_demo, completed, last_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`);
  const currentYear = new Date(now).getUTCFullYear();
  let count = 0;

  transaction(db, () => {
    for (const city of CITIES) {
      for (const [gender, showMe] of [...CITY_MIX, ...CITY_MIX, ...CITY_MIX]) {
        count += 1;
        const age = 21 + Math.floor(rand() * 22);
        const month = String(1 + Math.floor(rand() * 12)).padStart(2, '0');
        const day = String(1 + Math.floor(rand() * 28)).padStart(2, '0');
        const prompts = pickMany(rand, PROMPTS, 2 + Math.floor(rand() * 2)).map((p) => ({
          id: p.id,
          answer: pick(rand, ANSWERS[p.id]),
        }));
        // Dispersión de ~15 km alrededor del centro de la ciudad.
        const lat = city.lat + (rand() - 0.5) * 0.25;
        const lng = city.lng + (rand() - 0.5) * 0.25;
        // Contraseña inutilizable: estas cuentas no pueden iniciar sesión.
        const { lastInsertRowid: userId } = insertUser.run(`demo${count}@demo.sparka.local`, '!', now);
        insertProfile.run(
          userId,
          pick(rand, NAMES[gender]),
          `${currentYear - age}-${month}-${day}`,
          gender,
          JSON.stringify(showMe),
          weighted(rand, INTENTION_WEIGHTS),
          pick(rand, BIOS),
          rand() < 0.8 ? pick(rand, JOBS) : '',
          city.label,
          lat,
          lng,
          JSON.stringify(pickMany(rand, INTERESTS, 5 + Math.floor(rand() * 4)).map((i) => i.id)),
          JSON.stringify(prompts),
          Math.max(18, age - 8),
          Math.min(99, age + 12),
          100,
          now - Math.floor(rand() * 4 * 24 * 60 * 60 * 1000),
        );
      }
    }
  });
  return count;
}

const FIRST_REPLIES = [
  '¡Hola! 😊 Me alegra mucho el match.',
  '¡Hey! Qué ilusión que hayamos hecho match.',
  '¡Hola, hola! Me preguntaba si escribirías tú primero 😄',
];

const REPLIES = [
  'Jajaja me encanta. ¿Y tú qué tal la semana?',
  'Buena pregunta… déjame pensarlo 🤔 ¿Tú qué dirías?',
  '¡Eso suena genial! Cuéntame más.',
  'Me has sacado una sonrisa 😊',
  'Oye, para una primera cita: ¿café o cerveza?',
  'Yo soy más de planes improvisados, ¿y tú?',
  '¿Cuál ha sido tu mejor viaje hasta ahora?',
  'Totalmente. ¿Qué es lo que más te gusta hacer un finde?',
];

function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Comportamiento de los perfiles demo. `ctx` da acceso a db, notify, blind y pulse.
 * Los retrasos son configurables para que los tests no tengan que esperar.
 */
export function createDemo(
  ctx,
  { replyDelayMs = [1200, 3500], random = Math.random, blindLikeDelaysMs = [6000, 20000, 45000] } = {},
) {
  const { db, notify } = ctx;
  const pendingTimers = new Set();
  const answeredDays = new Set();

  function later(ms, fn) {
    const t = setTimeout(() => {
      pendingTimers.delete(t);
      fn();
    }, ms);
    t.unref?.();
    pendingTimers.add(t);
  }

  const delay = () => replyDelayMs[0] + random() * (replyDelayMs[1] - replyDelayMs[0]);

  /** Cuando alguien completa su perfil, algunos perfiles demo cercanos ya le han dado like. */
  function onProfileCompleted(userId) {
    const me = getProfile(db, userId);
    if (!me || me.isDemo) return;
    const candidates = db
      .prepare(
        `SELECT * FROM profiles WHERE is_demo = 1
         AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = profiles.user_id AND s.target_id = ?)`,
      )
      .all(userId)
      .map(parseProfile)
      .filter((p) => mutuallyEligible(me, p) && distanceKm(me.lat, me.lng, p.lat, p.lng) <= me.maxDistanceKm);
    const chosen = pickMany(random, candidates, 4);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO swipes (swiper_id, target_id, action, message, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    chosen.forEach((p, i) => {
      const superlike = i === 0;
      let message = null;
      if (superlike) {
        const shared = p.interests.find((id) => me.interests.includes(id));
        const prompt = promptById.get(me.prompts[0]?.id);
        message = shared
          ? `¡Hola! Vi que también te gusta ${interestById.get(shared).label.toLowerCase()} ${interestById.get(shared).emoji}`
          : `Me encantó tu respuesta a "${prompt?.text ?? 'tu pregunta'}" 😄`;
      }
      insert.run(p.userId, userId, superlike ? 'superlike' : 'like', message, Date.now() - i * 60_000);
    });
    if (chosen.length) notify(userId, 'likes:changed', {});
  }

  /** Al recibir un like, un perfil demo puede devolverlo (y así ver un match al instante). */
  function maybeLikeBack(demoId, userId, action) {
    const probability = action === 'superlike' ? 0.85 : 0.5;
    if (random() >= probability) return;
    db.prepare(
      'INSERT OR IGNORE INTO swipes (swiper_id, target_id, action, created_at) VALUES (?, ?, ?, ?)',
    ).run(demoId, userId, 'like', Date.now());
  }

  function replyText(matchId, demoId, userId) {
    const sent = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE match_id = ? AND sender_id = ?').get(matchId, demoId).n;
    if (sent === 0) return pick(random, FIRST_REPLIES);
    if (sent === 1) {
      const demo = getProfile(db, demoId);
      const me = getProfile(db, userId);
      const shared = demo.interests.find((id) => me.interests.includes(id));
      if (shared) {
        const i = interestById.get(shared);
        return `Por cierto, vi que también te gusta ${i.label.toLowerCase()} ${i.emoji}. ¿Algún plan o sitio que me recomiendes?`;
      }
    }
    if (sent >= 5 && sent % 5 === 0) {
      return 'Me lo estoy pasando genial 😊 (Recuerda: soy un perfil de demostración de Sparka. Con gente real, ¡aquí empezaría lo bueno!)';
    }
    return pick(random, REPLIES);
  }

  /** Simula que el perfil demo escribe y responde. */
  function scheduleReply(matchId, demoId, userId, deliver) {
    later(400, () => {
      if (!getMatchFor(db, matchId, demoId) || getMatchFor(db, matchId, demoId).closed_at) return;
      notify(userId, 'typing', { matchId, userId: demoId });
      later(delay(), () => {
        if (!getMatchFor(db, matchId, demoId) || getMatchFor(db, matchId, demoId).closed_at) return;
        const readAt = Date.now();
        db.prepare('UPDATE messages SET read_at = ? WHERE match_id = ? AND sender_id = ? AND read_at IS NULL').run(
          readAt,
          matchId,
          userId,
        );
        notify(userId, 'message:read', { matchId, readAt });
        deliver(matchId, demoId, replyText(matchId, demoId, userId));
      });
    });
  }

  /** Los perfiles demo responden a la Pregunta del Día: por ciudad y género, cada cual una respuesta distinta. */
  function ensureBlindAnswers(day) {
    if (answeredDays.has(day)) return;
    const done = db
      .prepare('SELECT 1 FROM blind_answers a JOIN profiles p ON p.user_id = a.user_id WHERE a.day = ? AND p.is_demo = 1 LIMIT 1')
      .get(day);
    if (!done) {
      const question = questionForDay(day);
      const rand = mulberry32(seedFrom(day));
      const groups = new Map();
      for (const p of db.prepare('SELECT user_id, city, gender FROM profiles WHERE is_demo = 1 ORDER BY user_id').all()) {
        const key = `${p.city}|${p.gender}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p.user_id);
      }
      const now = Date.now();
      const dayStart = Date.parse(`${day}T00:00:00Z`);
      const insert = db.prepare(
        'INSERT OR IGNORE INTO blind_answers (user_id, day, question_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
      );
      transaction(db, () => {
        for (const ids of groups.values()) {
          const answers = pickMany(rand, question.demo, question.demo.length);
          pickMany(rand, ids, answers.length).forEach((userId, i) => {
            insert.run(userId, day, question.id, answers[i], Math.max(dayStart, now - Math.floor(rand() * 3 * 3600_000)));
          });
        }
      });
    }
    answeredDays.add(day);
  }

  function demoLikesAnswerOf(demoId, userId, day) {
    const mine = ctx.blind.myAnswer(userId, day);
    const demo = getProfile(db, demoId);
    if (!mine || !demo) return;
    try {
      ctx.blind.like(demo, mine.id);
    } catch {
      // Ya no es posible (bloqueo, match, cambio de día…): no pasa nada.
    }
  }

  /** Al responder, a algunos perfiles demo les encanta tu respuesta… poco a poco, con suspense. */
  function onBlindAnswered(userId, day) {
    const me = getProfile(db, userId);
    if (!me || me.isDemo) return;
    const demos = ctx.blind.candidates(me, day).filter((c) => c.profile.isDemo);
    pickMany(random, demos, blindLikeDelaysMs.length).forEach((c, i) =>
      later(blindLikeDelaysMs[i], () => demoLikesAnswerOf(c.profile.userId, userId, day)),
    );
  }

  /** Si das chispa a la respuesta de un perfil demo, quizá también le guste la tuya. */
  function onBlindLiked(demoId, userId, day) {
    if (random() >= 0.5) return;
    later(delay(), () => demoLikesAnswerOf(demoId, userId, day));
  }

  /** Los perfiles demo también responden al Pulso (casi siempre que sí). */
  function onPulseStarted(matchId) {
    const m = db.prepare('SELECT user_a, user_b FROM matches WHERE id = ?').get(matchId);
    for (const id of [m.user_a, m.user_b]) {
      if (!getProfile(db, id)?.isDemo) continue;
      const answer = random() < 0.8 ? 'yes' : 'no';
      later(delay() * 2, () => {
        try {
          ctx.pulse.vote(matchId, id, answer);
        } catch {
          // El Pulso ya se resolvió o el match ya no existe.
        }
      });
    }
  }

  function stop() {
    for (const t of pendingTimers) clearTimeout(t);
    pendingTimers.clear();
  }

  return {
    onProfileCompleted,
    maybeLikeBack,
    scheduleReply,
    ensureBlindAnswers,
    onBlindAnswered,
    onBlindLiked,
    onPulseStarted,
    stop,
  };
}
