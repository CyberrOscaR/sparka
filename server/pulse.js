// El Pulso: adiós al ghosting. Cuando una conversación se enfría (o alguien lo pide), Sparka pregunta
// en secreto a las dos personas si quieren seguir. Un "sí" solo se revela si es mutuo; un "no" cierra
// la conversación con una despedida amable; sin respuesta en 3 días, se cierra sola.
import { interestById } from './catalog.js';
import { postMessage } from './matchmaker.js';
import { getProfile } from './store.js';
import { HttpError } from './validation.js';

const HOUR = 60 * 60 * 1000;
export const PULSE_STALE_MS = 48 * HOUR; // silencio que dispara un Pulso automático
export const PULSE_TIMEOUT_MS = 72 * HOUR; // tiempo para responder
export const PULSE_COOLDOWN_MS = 24 * HOUR; // entre un Pulso y el siguiente

const PLAN_IDEAS = {
  cafe: 'un café de especialidad sin prisa',
  senderismo: 'una ruta corta y algo de picar al final',
  montana: 'una ruta corta y algo de picar al final',
  cine: 'una peli y debatirla después con algo de cenar',
  series: 'una peli y debatirla después con algo de cenar',
  conciertos: 'un concierto pequeño de alguien que no conozcáis',
  indie: 'un concierto pequeño de alguien que no conozcáis',
  cocinar: 'cocinar juntos algo que nunca hayáis probado',
  gastronomia: 'ese restaurante que os apetece desde hace tiempo',
  museos: 'una exposición, y que cada cual elija su obra favorita',
  arte: 'una exposición, y que cada cual elija su obra favorita',
  juegos_mesa: 'un café de juegos de mesa (con revancha incluida)',
  vino: 'un vermut o una cata de vinos tranquila',
  cerveza: 'una cervecería artesanal para probar algo nuevo',
  bailar: 'una clase de baile para principiantes',
  karaoke: 'un karaoke: el dúo se decide allí',
  lectura: 'una librería con café y regalaros un libro',
  playa: 'un paseo por la playa al atardecer',
  yoga: 'una clase de yoga y un zumo después',
  correr: 'una carrera suave y un buen desayuno',
  ciclismo: 'una ruta en bici por la ciudad',
  fotografia: 'un paseo fotográfico por un barrio que no conozcáis',
  perros: 'un paseo por el parque (con perros, si hay)',
  comedia: 'un monólogo de stand-up',
  teatro: 'una obra de teatro y comentarla después',
  videojuegos: 'una tarde de recreativos',
};

export function planIdea(a, b) {
  const shared = a.interests.filter((i) => b.interests.includes(i) && PLAN_IDEAS[i]);
  if (shared.length === 0) return { idea: 'un paseo y un café, sin prisa', because: null };
  const pick = shared[Math.floor(Math.random() * shared.length)];
  return { idea: PLAN_IDEAS[pick], because: interestById.get(pick)?.label.toLowerCase() };
}

export function createPulse(ctx) {
  const { db, notify } = ctx;

  const load = (matchId) => db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  const voteColumn = (m, userId) => (m.user_a === userId ? 'pulse_a' : 'pulse_b');
  const both = (m, event, payload) => {
    notify(m.user_a, event, payload);
    notify(m.user_b, event, payload);
  };

  /** Estado visible para `userId`. Nunca incluye el voto de la otra persona. */
  function stateFor(m, userId, now = Date.now()) {
    const active = Boolean(m.pulse_started_at) && !m.closed_at;
    return {
      closed: m.closed_at ? { at: m.closed_at, reason: m.closed_reason } : null,
      pulse: active
        ? { startedAt: m.pulse_started_at, expiresAt: m.pulse_started_at + PULSE_TIMEOUT_MS, myVote: m[voteColumn(m, userId)] }
        : null,
      canStartPulse: !m.closed_at && !active && (!m.last_pulse_at || m.last_pulse_at < now - PULSE_COOLDOWN_MS),
    };
  }

  /** `starterId` es null cuando el Pulso es automático. */
  function start(m, starterId = null) {
    const now = Date.now();
    db.prepare('UPDATE matches SET pulse_started_at = ?, pulse_a = NULL, pulse_b = NULL, last_pulse_at = ? WHERE id = ?').run(
      now,
      now,
      m.id,
    );
    for (const userId of [m.user_a, m.user_b]) {
      notify(userId, 'pulse:changed', { matchId: m.id, pending: userId !== starterId });
    }
    ctx.demo?.onPulseStarted(m.id);
  }

  function close(m, reason, senderId) {
    db.prepare(
      `UPDATE matches SET closed_at = ?, closed_reason = ?, pulse_started_at = NULL, pulse_a = NULL, pulse_b = NULL
       WHERE id = ?`,
    ).run(Date.now(), reason, m.id);
    const body =
      reason === 'pulse_no'
        ? '💐 Esta conversación se ha cerrado con el Pulso. Gracias por la charla y mucha suerte: en Sparka nadie desaparece sin decir adiós.'
        : '⏳ El Pulso caducó sin respuesta, así que la conversación se ha cerrado. Aquí nadie se queda esperando.';
    postMessage(ctx, m.id, senderId, body, { kind: 'system' });
    both(m, 'pulse:changed', { matchId: m.id });
  }

  function resolveMutual(m, lastVoterId) {
    db.prepare('UPDATE matches SET pulse_started_at = NULL, pulse_a = NULL, pulse_b = NULL, last_pulse_at = ? WHERE id = ?').run(
      Date.now(),
      m.id,
    );
    const { idea, because } = planIdea(getProfile(db, m.user_a), getProfile(db, m.user_b));
    const body = `💓 ¡Pulso mutuo! A los dos os apetece seguir. ¿Y si dais el paso? Idea${because ? ` (porque os gusta ${because})` : ''}: ${idea}.`;
    postMessage(ctx, m.id, lastVoterId, body, { kind: 'system' });
    both(m, 'pulse:changed', { matchId: m.id });
  }

  function loadFor(matchId, userId) {
    const m = load(matchId);
    if (!m || (m.user_a !== userId && m.user_b !== userId)) throw new HttpError(404, 'Este match ya no existe.');
    return m;
  }

  /** "Tomar el Pulso" a mano. */
  function startManual(matchId, userId) {
    const m = loadFor(matchId, userId);
    const s = stateFor(m, userId);
    if (s.closed) throw new HttpError(409, 'Esta conversación está cerrada.');
    if (s.pulse) throw new HttpError(409, 'Ya hay un Pulso en marcha.');
    if (!s.canStartPulse) throw new HttpError(429, 'Ya tomasteis el Pulso hace poco. Podrás repetirlo mañana.');
    start(m, userId);
    return stateFor(load(matchId), userId);
  }

  function vote(matchId, userId, answer) {
    const m = loadFor(matchId, userId);
    if (m.closed_at) throw new HttpError(409, 'Esta conversación está cerrada.');
    if (!m.pulse_started_at) throw new HttpError(409, 'No hay ningún Pulso en marcha.');
    const column = voteColumn(m, userId);
    if (m[column]) throw new HttpError(409, 'Ya has respondido a este Pulso.');

    if (answer === 'no') {
      close(m, 'pulse_no', userId);
    } else {
      db.prepare(`UPDATE matches SET ${column} = 'yes' WHERE id = ?`).run(m.id);
      const updated = load(m.id);
      if (updated.pulse_a === 'yes' && updated.pulse_b === 'yes') resolveMutual(updated, userId);
      // Si aún falta la otra persona, no le avisamos de nada: tu "sí" es secreto.
      else notify(userId, 'pulse:changed', { matchId: m.id });
    }
    return stateFor(load(m.id), userId);
  }

  /** Cierra los Pulsos caducados y lanza Pulsos en conversaciones que llevan tiempo en silencio. */
  function sweep({ userId = null, now = Date.now() } = {}) {
    const mine = userId == null ? '' : 'AND (m.user_a = :user OR m.user_b = :user)';
    const params = userId == null ? {} : { user: userId };

    const expired = db
      .prepare(`SELECT * FROM matches m WHERE closed_at IS NULL AND pulse_started_at < :cut ${mine}`)
      .all({ ...params, cut: now - PULSE_TIMEOUT_MS });
    for (const m of expired) close(m, 'pulse_timeout', m.pulse_a ? m.user_b : m.user_a);

    const stale = db
      .prepare(
        `SELECT m.* FROM matches m
         WHERE closed_at IS NULL AND pulse_started_at IS NULL AND (last_pulse_at IS NULL OR last_pulse_at < :cut) ${mine}
           AND COALESCE((SELECT MAX(created_at) FROM messages WHERE match_id = m.id), m.created_at) < :cut`,
      )
      .all({ ...params, cut: now - PULSE_STALE_MS });
    for (const m of stale) start(m);
  }

  return { stateFor, startManual, vote, sweep };
}
