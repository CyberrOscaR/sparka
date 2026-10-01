// Coincidir: cuadrar una cita sin el baile de "¿y tú cuándo puedes?". Cada persona marca en secreto
// sus huecos de la semana y Sparka solo revela cuándo coincidís: nunca la agenda de la otra persona
// ni cuándo "no puede".
import { postMessage } from './matchmaker.js';
import { planIdea } from './pulse.js';
import { getProfile } from './store.js';
import { HttpError } from './validation.js';

const DAY = 24 * 60 * 60 * 1000;
export const COINCIDE_TIMEOUT_MS = 3 * DAY;
export const FRANJAS = ['manana', 'tarde', 'noche'];
const FRANJA_LABEL = { manana: 'por la mañana', tarde: 'por la tarde', noche: 'por la noche' };

const dayFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** "2026-10-04:tarde" → "sábado, 4 de octubre por la tarde". Las fechas son las del calendario local de quien marca. */
export function slotLabel(slot) {
  const [date, franja] = slot.split(':');
  return `${dayFmt.format(new Date(`${date}T12:00:00Z`))} ${FRANJA_LABEL[franja]}`;
}

/** Orden cronológico: por fecha y luego mañana → tarde → noche. */
export function sortSlots(slots) {
  return [...slots].sort((a, b) => {
    const [da, fa] = a.split(':');
    const [db, fb] = b.split(':');
    return da === db ? FRANJAS.indexOf(fa) - FRANJAS.indexOf(fb) : da < db ? -1 : 1;
  });
}

/** Fechas aceptadas: de ayer a dentro de 8 días (margen para zonas horarias). */
function inWindow(slot, now) {
  const time = Date.parse(`${slot.split(':')[0]}T00:00:00Z`);
  return !Number.isNaN(time) && time >= now - 2 * DAY && time <= now + 8 * DAY;
}

export function createCoincide(ctx) {
  const { db, notify } = ctx;

  const load = (matchId) => db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  const column = (m, userId) => (m.user_a === userId ? 'coincide_a' : 'coincide_b');
  const isActive = (m, now = Date.now()) =>
    Boolean(m.coincide_started_at) && m.coincide_started_at > now - COINCIDE_TIMEOUT_MS && !m.closed_at;

  function loadFor(matchId, userId) {
    const m = load(matchId);
    if (!m || (m.user_a !== userId && m.user_b !== userId)) throw new HttpError(404, 'Este match ya no existe.');
    if (m.closed_at) throw new HttpError(409, 'Esta conversación está cerrada.');
    return m;
  }

  /** Lo que ve `userId`: solo sus propios huecos, nunca los de la otra persona. */
  function stateFor(m, userId, now = Date.now()) {
    if (!isActive(m, now)) return { coincide: null };
    const mine = m[column(m, userId)];
    return {
      coincide: {
        startedAt: m.coincide_started_at,
        expiresAt: m.coincide_started_at + COINCIDE_TIMEOUT_MS,
        mySlots: mine ? JSON.parse(mine) : null,
      },
    };
  }

  function start(matchId, userId) {
    const m = loadFor(matchId, userId);
    if (isActive(m)) throw new HttpError(409, 'Ya estáis buscando cuándo coincidís.');
    db.prepare('UPDATE matches SET coincide_started_at = ?, coincide_a = NULL, coincide_b = NULL WHERE id = ?').run(
      Date.now(),
      m.id,
    );
    for (const id of [m.user_a, m.user_b]) notify(id, 'coincide:changed', { matchId: m.id, pending: id !== userId });
    ctx.demo?.onCoincideStarted(m.id);
    return stateFor(load(m.id), userId);
  }

  /** `lastId`: quien marcó último. El mensaje cuenta como no leído para quien marcó antes y no está mirando. */
  function resolve(m, lastId) {
    const a = new Set(JSON.parse(m.coincide_a));
    const overlap = sortSlots(JSON.parse(m.coincide_b).filter((s) => a.has(s)));
    db.prepare('UPDATE matches SET coincide_started_at = NULL, coincide_a = NULL, coincide_b = NULL WHERE id = ?').run(m.id);

    if (overlap.length === 0) {
      postMessage(
        ctx,
        m.id,
        lastId,
        '📅 Esta semana no coincidís en ningún momento. ¡No pasa nada! Probad otra vez la semana que viene.',
        { kind: 'system' },
      );
    } else {
      const { idea, because } = planIdea(getProfile(db, m.user_a), getProfile(db, m.user_b));
      const slots = overlap.slice(0, 4);
      postMessage(ctx, m.id, lastId, `📅 ¡Coincidís! ${slotLabel(slots[0])}. Idea: ${idea}.`, {
        kind: 'plan',
        data: { slots, idea, because },
      });
    }
    for (const id of [m.user_a, m.user_b]) notify(id, 'coincide:changed', { matchId: m.id });
  }

  /** Guarda tus huecos (puedes cambiarlos hasta que la otra persona marque los suyos). */
  function submit(matchId, userId, slots, now = Date.now()) {
    const m = loadFor(matchId, userId);
    if (!isActive(m, now)) throw new HttpError(409, 'No hay ninguna búsqueda de cita en marcha.');
    const unique = [...new Set(slots)];
    if (unique.some((s) => !inWindow(s, now))) throw new HttpError(400, 'Solo puedes marcar huecos de esta semana.');
    db.prepare(`UPDATE matches SET ${column(m, userId)} = ? WHERE id = ?`).run(JSON.stringify(sortSlots(unique)), m.id);

    const updated = load(m.id);
    if (updated.coincide_a && updated.coincide_b) {
      resolve(updated, userId);
    } else {
      notify(userId, 'coincide:changed', { matchId: m.id });
    }
    return stateFor(load(m.id), userId);
  }

  return { stateFor, start, submit, isActive };
}
