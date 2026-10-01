// Autocitas: rellenas tus gustos y lo que piensas; cuando alguien encaja contigo al 65 % o más,
// Sparka os propone una cita con plan incluido. Cada cual acepta en secreto y, si los dos os apuntáis,
// se abre el chat y empieza "Coincidir" para cuadrar la hora.
import { AUTOCITA_QUESTIONS, IMPORTANCE, allOptions, autocitaQuestionById, publicQuestions } from './autocitaQuestions.js';
import { intentionFit } from './catalog.js';
import { distanceKm, mutuallyEligible, parseProfile, publicProfile } from './matching.js';
import { createMatch } from './matchmaker.js';
import { planIdea } from './pulse.js';
import { getMatchBetween, getPhotoUrls, getProfile, isBlockedEitherWay, pairOf } from './store.js';
import { HttpError } from './validation.js';

export const AUTOCITA_THRESHOLD = 65;
export const MIN_COMMON = 8; // preguntas respondidas por los dos (sin contar "prefiero no decirlo")
export const MAX_PENDING = 3; // propuestas abiertas a la vez por persona: que sean especiales
export const AUTOCITA_TTL_MS = 72 * 60 * 60 * 1000;
const INTENTION_WEIGHT = 2;

const plainLabel = (label) => label.replace(/^[^\p{L}]+/u, '').trim();

/** Cuánto se parecen dos respuestas a una pregunta (0..1), o null si no se puede comparar. */
export function questionSimilarity(q, a, b) {
  if (a == null || b == null) return null;
  if (q.type === 'multi') {
    if (!a.length || !b.length) return null;
    const shared = b.filter((x) => a.includes(x)).length;
    return shared / Math.min(a.length, b.length);
  }
  if (a === 'nodecir' || b === 'nodecir') return null;
  const scaleSim = (x, y) => {
    const i = q.options.findIndex((o) => o.id === x);
    const j = q.options.findIndex((o) => o.id === y);
    if (i < 0 || j < 0) return null;
    return 1 - Math.abs(i - j) / (q.options.length - 1);
  };
  if (q.sim) return q.sim(a, b, scaleSim);
  if (q.type === 'scale') return scaleSim(a, b);
  return a === b ? 1 : 0;
}

/**
 * Afinidad profunda entre dos cuestionarios. Cada persona pondera según lo que a ELLA le importa,
 * y se combinan con una media geométrica: tiene que encajar para las dos. Un "imprescindible"
 * que no se cumple deja la afinidad por debajo del umbral.
 */
export function deepScore(answersA, answersB, profileA, profileB) {
  let numA = 0;
  let denA = 0;
  let numB = 0;
  let denB = 0;
  let common = 0;
  let dealbreak = false;
  const sims = {};
  for (const q of AUTOCITA_QUESTIONS) {
    const a = answersA[q.id];
    const b = answersB[q.id];
    if (!a || !b) continue;
    const s = questionSimilarity(q, a.value, b.value);
    if (s == null) continue;
    common += 1;
    sims[q.id] = s;
    const ia = IMPORTANCE[a.importance] ?? IMPORTANCE.importa;
    const ib = IMPORTANCE[b.importance] ?? IMPORTANCE.importa;
    numA += ia.weight * s;
    denA += ia.weight;
    numB += ib.weight * s;
    denB += ib.weight;
    if ((ia.dealbreaker || ib.dealbreaker) && s < 0.5) dealbreak = true;
  }
  if (common < MIN_COMMON) return null;
  if (profileA && profileB) {
    const fit = intentionFit(profileA.intention, profileB.intention);
    numA += INTENTION_WEIGHT * fit;
    denA += INTENTION_WEIGHT;
    numB += INTENTION_WEIGHT * fit;
    denB += INTENTION_WEIGHT;
  }
  const sa = denA ? numA / denA : 0;
  const sb = denB ? numB / denB : 0;
  let score = Math.round(Math.sqrt(sa * sb) * 100);
  if (dealbreak) score = Math.min(score, 40);
  return { score, common, dealbreak, sims };
}

/** Motivos que se pueden enseñar. Nunca se nombran las preguntas sensibles (política, religión…). */
export function reasonsFor(answersA, answersB, sims) {
  const reasons = AUTOCITA_QUESTIONS.filter((q) => !q.sensitive && q.reason && sims[q.id] >= 0.85)
    .map((q) => {
      const a = answersA[q.id];
      const b = answersB[q.id];
      const shared =
        q.type === 'multi'
          ? q.options.filter((o) => a.value.includes(o.id) && b.value.includes(o.id)).map((o) => plainLabel(o.label))
          : [];
      if (q.type === 'multi' && shared.length === 0) return null;
      const weight = (IMPORTANCE[a.importance]?.weight ?? 1) + (IMPORTANCE[b.importance]?.weight ?? 1);
      return { text: q.reason(shared, a.value, b.value), weight };
    })
    .filter(Boolean)
    .sort((x, y) => y.weight - x.weight)
    .slice(0, 3)
    .map((r) => r.text);

  const sensitive = AUTOCITA_QUESTIONS.filter((q) => q.sensitive && sims[q.id] != null).map((q) => sims[q.id]);
  if (sensitive.length >= 2 && sensitive.reduce((s, x) => s + x, 0) / sensitive.length >= 0.75) {
    reasons.push('Vuestros valores encajan');
  }
  return reasons;
}

const FINDE_PLANS = {
  naturaleza: 'una ruta corta por la naturaleza y algo de picar al final',
  ciudad: 'una exposición y unas cañas en una terraza',
  casa: 'un café tranquilo para conoceros (y, si hay química, cocinar juntos otro día)',
  fiesta: 'unas cañas que terminen en un concierto o bailando',
  viaje: 'un paseo por un pueblo bonito cerca de vuestra ciudad',
};

function planFor(answersA, answersB, profileA, profileB) {
  const finde = autocitaQuestionById.get('finde');
  const shared = (answersA.finde?.value ?? []).filter((x) => (answersB.finde?.value ?? []).includes(x));
  if (shared.length) {
    const pick = shared[0];
    return { idea: FINDE_PLANS[pick], because: `os encanta el plan «${plainLabel(finde.options.find((o) => o.id === pick).label).toLowerCase()}»` };
  }
  const { idea, because } = planIdea(profileA, profileB);
  return { idea, because: because ? `os gusta ${because}` : null };
}

export function createAutocitas(ctx) {
  const { db, notify } = ctx;

  function questionnaire(userId) {
    const row = db.prepare('SELECT * FROM autocita_profiles WHERE user_id = ?').get(userId);
    return row ? { enabled: Boolean(row.enabled), answers: JSON.parse(row.answers) } : { enabled: false, answers: {} };
  }

  function validate(answers) {
    for (const [qid, answer] of Object.entries(answers)) {
      const q = autocitaQuestionById.get(qid);
      if (!q) throw new HttpError(400, 'Hay una pregunta que no existe.');
      if (!IMPORTANCE[answer.importance]) throw new HttpError(400, 'Importancia no válida.');
      const ids = allOptions(q).map((o) => o.id);
      if (q.type === 'multi') {
        const v = answer.value;
        if (!Array.isArray(v) || v.length === 0 || v.length > q.max || new Set(v).size !== v.length) {
          throw new HttpError(400, `En «${q.text}» elige entre 1 y ${q.max} opciones.`);
        }
        if (v.some((x) => !ids.includes(x))) throw new HttpError(400, `Respuesta no válida en «${q.text}».`);
      } else if (typeof answer.value !== 'string' || !ids.includes(answer.value)) {
        throw new HttpError(400, `Respuesta no válida en «${q.text}».`);
      }
    }
  }

  function expire(now = Date.now()) {
    db.prepare("UPDATE autocitas SET status = 'expired', resolved_at = ? WHERE status = 'pending' AND created_at < ?").run(
      now,
      now - AUTOCITA_TTL_MS,
    );
  }

  const pendingCount = (userId) =>
    db.prepare("SELECT COUNT(*) AS n FROM autocitas WHERE status = 'pending' AND (user_a = ? OR user_b = ?)").get(userId, userId).n;

  /** Propuestas que esperan TU respuesta (para el aviso en el menú). */
  function pendingForMe(userId) {
    expire();
    return db
      .prepare(
        `SELECT COUNT(*) AS n FROM autocitas WHERE status = 'pending'
         AND ((user_a = :me AND a_response IS NULL) OR (user_b = :me AND b_response IS NULL))`,
      )
      .get({ me: userId }).n;
  }

  function create(meProfile, meAnswers, other, otherAnswers, result) {
    const [a, b] = pairOf(meProfile.userId, other.userId);
    const [answersA, answersB] = a === meProfile.userId ? [meAnswers, otherAnswers] : [otherAnswers, meAnswers];
    const reasons = reasonsFor(answersA, answersB, result.sims);
    const plan = planFor(meAnswers, otherAnswers, meProfile, other);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO autocitas (user_a, user_b, score, reasons, plan, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(a, b, result.score, JSON.stringify(reasons), JSON.stringify(plan), Date.now());
    const id = Number(lastInsertRowid);
    notify(a, 'autocita:new', { id, score: result.score });
    notify(b, 'autocita:new', { id, score: result.score });
    ctx.demo?.onAutocitaProposed(id);
    return id;
  }

  /** Busca personas compatibles al 65 % o más y les propone una autocita. Devuelve cuántas se han creado. */
  function generateFor(userId) {
    expire();
    const mine = questionnaire(userId);
    const me = getProfile(db, userId);
    if (!mine.enabled || !me?.completed) return 0;
    let open = pendingCount(userId);
    if (open >= MAX_PENDING) return 0;

    const rows = db
      .prepare(
        `SELECT p.*, ap.answers AS ac_answers FROM autocita_profiles ap
         JOIN profiles p ON p.user_id = ap.user_id
         WHERE ap.enabled = 1 AND ap.user_id != :me AND p.completed = 1
           AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = :me AND b.blocked_id = p.user_id)
                                                  OR (b.blocker_id = p.user_id AND b.blocked_id = :me))
           AND NOT EXISTS (SELECT 1 FROM matches m WHERE (m.user_a = :me AND m.user_b = p.user_id)
                                                    OR (m.user_b = :me AND m.user_a = p.user_id))
           AND NOT EXISTS (SELECT 1 FROM autocitas x WHERE (x.user_a = :me AND x.user_b = p.user_id)
                                                      OR (x.user_b = :me AND x.user_a = p.user_id))`,
      )
      .all({ me: userId });

    const candidates = rows
      .map((r) => ({ profile: parseProfile(r), answers: JSON.parse(r.ac_answers) }))
      .filter(({ profile: p }) => mutuallyEligible(me, p))
      .filter(({ profile: p }) => {
        const d = distanceKm(me.lat, me.lng, p.lat, p.lng);
        return d <= me.maxDistanceKm && d <= p.maxDistanceKm;
      })
      .filter(({ profile: p }) => me.filterIntentions.length === 0 || me.filterIntentions.includes(p.intention))
      .filter(({ profile: p }) => p.filterIntentions.length === 0 || p.filterIntentions.includes(me.intention))
      .map((c) => ({ ...c, result: deepScore(mine.answers, c.answers, me, c.profile) }))
      .filter((c) => c.result && c.result.score >= AUTOCITA_THRESHOLD)
      .sort((x, y) => y.result.score - x.result.score);

    let created = 0;
    for (const c of candidates) {
      if (open >= MAX_PENDING) break;
      if (pendingCount(c.profile.userId) >= MAX_PENDING) continue;
      create(me, mine.answers, c.profile, c.answers, c.result);
      open += 1;
      created += 1;
    }
    return created;
  }

  function proposals(userId) {
    expire();
    const me = getProfile(db, userId);
    return db
      .prepare(
        `SELECT * FROM autocitas WHERE status = 'pending' AND (user_a = :me OR user_b = :me) ORDER BY score DESC`,
      )
      .all({ me: userId })
      .filter((r) => !isBlockedEitherWay(db, r.user_a, r.user_b))
      .map((r) => {
        const otherId = r.user_a === userId ? r.user_b : r.user_a;
        const other = getProfile(db, otherId);
        return {
          id: r.id,
          score: r.score,
          reasons: JSON.parse(r.reasons),
          plan: JSON.parse(r.plan),
          createdAt: r.created_at,
          expiresAt: r.created_at + AUTOCITA_TTL_MS,
          myResponse: r.user_a === userId ? r.a_response : r.b_response,
          user: publicProfile(other, getPhotoUrls(db, otherId), me),
        };
      });
  }

  function state(userId, { generate = true } = {}) {
    const mine = questionnaire(userId);
    if (generate && mine.enabled) generateFor(userId);
    return {
      enabled: mine.enabled,
      answers: mine.answers,
      questions: publicQuestions(),
      importance: Object.entries(IMPORTANCE).map(([id, { label }]) => ({ id, label })),
      threshold: AUTOCITA_THRESHOLD,
      minAnswers: MIN_COMMON,
      proposals: proposals(userId),
    };
  }

  function save(userId, { enabled, answers }) {
    validate(answers);
    if (enabled && Object.keys(answers).length < MIN_COMMON) {
      throw new HttpError(400, `Responde al menos ${MIN_COMMON} preguntas para activar las Autocitas.`);
    }
    db.prepare(
      `INSERT INTO autocita_profiles (user_id, enabled, answers, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET enabled = excluded.enabled, answers = excluded.answers, updated_at = excluded.updated_at`,
    ).run(userId, enabled ? 1 : 0, JSON.stringify(answers), Date.now());

    if (!enabled) {
      // Al desactivar, retiramos las propuestas abiertas.
      const open = db
        .prepare("SELECT * FROM autocitas WHERE status = 'pending' AND (user_a = ? OR user_b = ?)")
        .all(userId, userId);
      db.prepare("UPDATE autocitas SET status = 'declined', resolved_at = ? WHERE status = 'pending' AND (user_a = ? OR user_b = ?)").run(
        Date.now(),
        userId,
        userId,
      );
      for (const r of open) notify(r.user_a === userId ? r.user_b : r.user_a, 'autocita:changed', { id: r.id });
    }
    const created = enabled ? generateFor(userId) : 0;
    return { ...state(userId, { generate: false }), created };
  }

  /** Te apuntas (o no) a una autocita. Tu respuesta es secreta: solo cuenta si las dos sois un «sí». */
  function respond(userId, id, answer) {
    expire();
    const r = db.prepare('SELECT * FROM autocitas WHERE id = ?').get(id);
    if (!r || (r.user_a !== userId && r.user_b !== userId)) throw new HttpError(404, 'Esta autocita no existe.');
    if (r.status !== 'pending') throw new HttpError(409, 'Esta autocita ya no está disponible.');
    const column = r.user_a === userId ? 'a_response' : 'b_response';
    if (r[column]) throw new HttpError(409, 'Ya has respondido a esta autocita.');
    const otherId = r.user_a === userId ? r.user_b : r.user_a;

    if (answer === 'no' || isBlockedEitherWay(db, userId, otherId)) {
      db.prepare("UPDATE autocitas SET status = 'declined', resolved_at = ? WHERE id = ?").run(Date.now(), id);
      notify(otherId, 'autocita:changed', { id });
      return { matched: false };
    }

    db.prepare(`UPDATE autocitas SET ${column} = 'yes' WHERE id = ?`).run(id);
    const updated = db.prepare('SELECT * FROM autocitas WHERE id = ?').get(id);
    if (updated.a_response !== 'yes' || updated.b_response !== 'yes') {
      notify(userId, 'autocita:changed', { id });
      return { matched: false, waiting: true };
    }

    // ¡Los dos os apuntáis! Abrimos el chat con la autocita y empezamos a cuadrar la hora.
    db.prepare("UPDATE autocitas SET status = 'accepted', resolved_at = ? WHERE id = ?").run(Date.now(), id);
    if (getMatchBetween(db, userId, otherId)) return { matched: false };
    const upsert = db.prepare(
      `INSERT INTO swipes (swiper_id, target_id, action, created_at) VALUES (?, ?, 'like', ?)
       ON CONFLICT (swiper_id, target_id) DO UPDATE SET action = 'like'`,
    );
    upsert.run(userId, otherId, Date.now());
    upsert.run(otherId, userId, Date.now());
    const plan = JSON.parse(updated.plan);
    const reasons = JSON.parse(updated.reasons);
    const match = createMatch(ctx, userId, otherId, {
      source: 'auto',
      intro: [
        {
          senderId: userId,
          kind: 'autocita',
          body: `✨ Autocita: ${updated.score} % de afinidad. Plan: ${plan.idea}.`,
          data: { score: updated.score, reasons, ...plan },
        },
      ],
    });
    db.prepare('UPDATE autocitas SET match_id = ? WHERE id = ?').run(match.id, id);
    ctx.coincide.startForBoth(match.id);
    return { matched: true, match };
  }

  return { state, save, respond, generateFor, pendingForMe, questionnaire };
}
