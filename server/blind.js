// "A ciegas": cada día, una pregunta para todo el mundo. Lees respuestas sin fotos ni nombres;
// si a dos personas les encanta la respuesta de la otra, hacen match y se revelan.
import { BLIND_QUESTIONS } from './blindQuestions.js';
import { mutuallyEligible, parseProfile, roundDistance, distanceKm } from './matching.js';
import { createMatch } from './matchmaker.js';
import { getMatchBetween } from './store.js';
import { HttpError } from './validation.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const FEED_LIMIT = 60;

/** Día actual en UTC ('YYYY-MM-DD'): la pregunta cambia para todo el mundo a la vez. */
export function blindDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function questionForDay(day) {
  const index = Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
  const n = BLIND_QUESTIONS.length;
  return BLIND_QUESTIONS[((index % n) + n) % n];
}

export function nextResetAt(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** Orden estable (por persona y día) pero distinto para cada quien: nadie tiene ventaja por responder antes. */
function stableHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createBlind(ctx) {
  const { db, notify } = ctx;

  function myAnswer(userId, day) {
    return db.prepare('SELECT * FROM blind_answers WHERE user_id = ? AND day = ?').get(userId, day);
  }

  function likesOn(answerId) {
    return db.prepare('SELECT COUNT(*) AS n FROM blind_likes WHERE answer_id = ?').get(answerId).n;
  }

  /**
   * Respuestas de hoy que `me` puede leer: mismas reglas que Descubrir (gustos mutuos, edad, distancia,
   * bloqueos, incógnito), salvo una: SÍ aparece gente a la que descartaste por su foto. Segunda oportunidad.
   */
  function candidates(me, day) {
    const rows = db
      .prepare(
        `SELECT p.*, a.id AS answer_id, a.body AS answer_body FROM blind_answers a
         JOIN profiles p ON p.user_id = a.user_id
         WHERE a.day = :day AND a.user_id != :me AND p.completed = 1
           AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = :me AND b.blocked_id = a.user_id)
                                                  OR (b.blocker_id = a.user_id AND b.blocked_id = :me))
           AND NOT EXISTS (SELECT 1 FROM matches m WHERE (m.user_a = :me AND m.user_b = a.user_id)
                                                    OR (m.user_b = :me AND m.user_a = a.user_id))
           AND (p.incognito = 0 OR EXISTS (SELECT 1 FROM swipes l WHERE l.swiper_id = a.user_id AND l.target_id = :me
                                            AND l.action IN ('like', 'superlike')))`,
      )
      .all({ day, me: me.userId });
    return rows
      .map((row) => ({ answerId: row.answer_id, body: row.answer_body, profile: parseProfile(row) }))
      .filter(({ profile }) => mutuallyEligible(me, profile))
      .filter(({ profile }) => me.filterIntentions.length === 0 || me.filterIntentions.includes(profile.intention))
      .map((c) => ({ ...c, distance: distanceKm(me.lat, me.lng, c.profile.lat, c.profile.lng) }))
      .filter((c) => c.distance <= me.maxDistanceKm);
  }

  /** Lo que se muestra de cada respuesta: ni nombre, ni fotos, ni id de usuario. */
  function feedFor(me, day) {
    const liked = new Set(
      db.prepare('SELECT answer_id FROM blind_likes WHERE liker_id = ?').all(me.userId).map((r) => r.answer_id),
    );
    return candidates(me, day)
      .sort((a, b) => stableHash(`${day}:${me.userId}:${a.answerId}`) - stableHash(`${day}:${me.userId}:${b.answerId}`))
      .map(({ answerId, body, profile, distance }) => ({
        id: answerId,
        body,
        age: profile.age,
        distanceKm: roundDistance(distance),
        intention: profile.intention,
        sharedInterests: profile.interests.filter((i) => me.interests.includes(i)).length,
        liked: liked.has(answerId),
      }));
  }

  function state(me, now = Date.now()) {
    const day = blindDay(now);
    const question = questionForDay(day);
    ctx.demo?.ensureBlindAnswers(day);
    const mine = myAnswer(me.userId, day);
    const feed = feedFor(me, day);
    return {
      day,
      question: { id: question.id, text: question.text },
      resetsAt: nextResetAt(now),
      myAnswer: mine ? { id: mine.id, body: mine.body, likes: likesOn(mine.id) } : null,
      nearbyCount: feed.length,
      // Para leer a los demás, primero hay que mojarse.
      feed: mine ? feed.slice(0, FEED_LIMIT) : null,
    };
  }

  function answer(me, body) {
    const day = blindDay();
    const question = questionForDay(day);
    const existing = myAnswer(me.userId, day);
    if (existing) {
      if (likesOn(existing.id) > 0) throw new HttpError(409, 'Tu respuesta ya ha recibido chispas y no se puede cambiar.');
      db.prepare('UPDATE blind_answers SET body = ? WHERE id = ?').run(body, existing.id);
    } else {
      db.prepare('INSERT INTO blind_answers (user_id, day, question_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(
        me.userId,
        day,
        question.id,
        body,
        Date.now(),
      );
      ctx.demo?.onBlindAnswered(me.userId, day);
    }
    return state(me);
  }

  /** Match a ciegas: los dos se dan "like" y la conversación empieza con sus respuestas. */
  function blindMatch(actorId, otherId, day) {
    if (getMatchBetween(db, actorId, otherId)) return null;
    const now = Date.now();
    const upsert = db.prepare(
      `INSERT INTO swipes (swiper_id, target_id, action, created_at) VALUES (?, ?, 'like', ?)
       ON CONFLICT (swiper_id, target_id) DO UPDATE SET action = 'like'`,
    );
    upsert.run(actorId, otherId, now);
    upsert.run(otherId, actorId, now);
    const question = questionForDay(day);
    const intro = db
      .prepare('SELECT user_id, body, created_at FROM blind_answers WHERE day = ? AND user_id IN (?, ?) ORDER BY created_at')
      .all(day, actorId, otherId)
      .map((a) => ({ senderId: a.user_id, kind: 'blind', body: `${question.text}\n${a.body}`, createdAt: a.created_at }));
    return createMatch(ctx, actorId, otherId, { source: 'blind', intro });
  }

  /**
   * Chispa a una respuesta. `me` debe haber respondido hoy. Si la otra persona ya había dado chispa
   * a la tuya, hay match. Si no, solo sabrá que "a alguien" le ha gustado: nunca quién.
   */
  function like(me, answerId) {
    const day = blindDay();
    const mine = myAnswer(me.userId, day);
    if (!mine) throw new HttpError(403, 'Responde primero a la pregunta de hoy para dar chispas.');
    const target = candidates(me, day).find((c) => c.answerId === answerId);
    if (!target) throw new HttpError(404, 'Esta respuesta ya no está disponible.');
    db.prepare('INSERT OR IGNORE INTO blind_likes (liker_id, answer_id, created_at) VALUES (?, ?, ?)').run(
      me.userId,
      answerId,
      Date.now(),
    );

    const authorId = target.profile.userId;
    const mutual = db
      .prepare('SELECT 1 FROM blind_likes l WHERE l.liker_id = ? AND l.answer_id = ?')
      .get(authorId, mine.id);
    if (mutual) {
      const match = blindMatch(me.userId, authorId, day);
      if (match) return { matched: true, match };
    }
    notify(authorId, 'blind:liked', { likes: likesOn(answerId) });
    if (target.profile.isDemo) ctx.demo?.onBlindLiked(authorId, me.userId, day);
    return { matched: false };
  }

  function unlike(me, answerId) {
    const { changes } = db.prepare('DELETE FROM blind_likes WHERE liker_id = ? AND answer_id = ?').run(me.userId, answerId);
    if (changes) {
      const author = db.prepare('SELECT user_id FROM blind_answers WHERE id = ?').get(answerId);
      if (author) notify(author.user_id, 'blind:liked', { likes: likesOn(answerId) });
    }
  }

  function summary(userId) {
    const mine = myAnswer(userId, blindDay());
    return { answered: Boolean(mine), likes: mine ? likesOn(mine.id) : 0 };
  }

  return { state, answer, like, unlike, candidates, myAnswer, summary };
}
