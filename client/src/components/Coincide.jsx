import { useMemo, useState } from 'react';
import { CalendarPlus, ShieldCheck } from 'lucide-react';
import { Modal } from './ui.jsx';

export const FRANJAS = [
  { id: 'manana', label: 'Mañana', emoji: '☀️', hour: 11, closesAt: 13 },
  { id: 'tarde', label: 'Tarde', emoji: '🌇', hour: 18, closesAt: 19 },
  { id: 'noche', label: 'Noche', emoji: '🌙', hour: 21, closesAt: 23 },
];
const FRANJA_TEXT = { manana: 'por la mañana', tarde: 'por la tarde', noche: 'por la noche' };

const pad = (n) => String(n).padStart(2, '0');
const localKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const longFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric' });

export function slotText(slot) {
  const [date, franja] = slot.split(':');
  return `${longFmt.format(parseKey(date))} ${FRANJA_TEXT[franja]}`;
}

/** Los próximos 7 días del calendario local. */
function nextDays(now = new Date()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    // Nunca "Mañana" como día: se confundiría con la franja de la mañana.
    return { key: localKey(d), label: i === 0 ? 'Hoy' : shortFmt.format(d), weekend: [0, 6].includes(d.getDay()) };
  });
}

/** Cuadrícula secreta de disponibilidad: 7 días × mañana/tarde/noche. */
export function AvailabilityPicker({ name, initial, onSave, onClose }) {
  const now = new Date();
  const days = useMemo(() => nextDays(now), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState(() => new Set(initial ?? []));
  const [busy, setBusy] = useState(false);
  const isPast = (dayIndex, franja) => dayIndex === 0 && now.getHours() >= franja.closesAt;

  const toggle = (slot) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(slot) ? next.delete(slot) : next.add(slot);
      return next;
    });
  const selectMany = (pick) =>
    setSelected((s) => {
      const next = new Set(s);
      days.forEach((d, i) => FRANJAS.forEach((f) => pick(d, f) && !isPast(i, f) && next.add(`${d.key}:${f.id}`)));
      return next;
    });

  async function save() {
    setBusy(true);
    try {
      await onSave([...selected]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="¿Cuándo podrías quedar?" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Marca tus huecos de esta semana. <strong>Es secreto:</strong> {name} nunca verá tu agenda, solo os diremos
        cuándo coincidís.
      </p>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button type="button" className="chip chip-sm" onClick={() => selectMany((_, f) => f.id === 'tarde')}>
          🌇 Todas las tardes
        </button>
        <button type="button" className="chip chip-sm" onClick={() => selectMany((_, f) => f.id === 'noche')}>
          🌙 Todas las noches
        </button>
        <button type="button" className="chip chip-sm" onClick={() => selectMany((d) => d.weekend)}>
          🎉 Fin de semana
        </button>
        <button type="button" className="chip chip-sm" onClick={() => setSelected(new Set())}>
          Borrar
        </button>
      </div>
      <div className="avail-grid" role="grid" aria-label="Disponibilidad">
        <span />
        {FRANJAS.map((f) => (
          <span key={f.id} className="avail-head">
            {f.emoji} {f.label}
          </span>
        ))}
        {days.map((d, i) => (
          <div className="avail-row" role="row" key={d.key}>
            <span className="avail-day">{d.label}</span>
            {FRANJAS.map((f) => {
              const slot = `${d.key}:${f.id}`;
              const on = selected.has(slot);
              const past = isPast(i, f);
              return (
                <button
                  type="button"
                  key={slot}
                  role="gridcell"
                  className={`avail-cell ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  aria-label={`${d.label} ${f.label}`}
                  disabled={past}
                  onClick={() => toggle(slot)}
                >
                  {on ? '✓' : ''}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="modal-foot" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <small className="hint">
          {selected.size} {selected.size === 1 ? 'hueco marcado' : 'huecos marcados'}
        </small>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          Guardar en secreto
        </button>
      </div>
    </Modal>
  );
}

function icsEscape(text) {
  return text.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
}

/** Archivo .ics para añadir la cita a cualquier calendario (hora local, 2 horas). */
function downloadIcs(slot, name, idea, matchId) {
  const [date, franja] = slot.split(':');
  const hour = FRANJAS.find((f) => f.id === franja).hour;
  const ymd = date.replaceAll('-', '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sparka//Coincidir//ES',
    'BEGIN:VEVENT',
    `UID:sparka-${matchId}-${date}-${franja}@sparka`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ymd}T${pad(hour)}0000`,
    `DTEND:${ymd}T${pad(hour + 2)}0000`,
    `SUMMARY:${icsEscape(`Cita con ${name} ✨`)}`,
    `DESCRIPTION:${icsEscape(`Idea: ${idea}. Queda en un sitio público y avisa a alguien de confianza.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `cita-con-${name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** El resultado de "Coincidir" dentro del chat. */
export function PlanCard({ message, otherName, matchId }) {
  const { slots, idea, because } = message.data;
  const [first, ...rest] = slots;
  return (
    <div className="plan-card" role="note">
      <span className="eyebrow">📅 ¡Coincidís!</span>
      <strong className="plan-when">{slotText(first)}</strong>
      <p>
        Idea{because ? ` (porque os gusta ${because})` : ''}: {idea}.
      </p>
      {rest.length > 0 && <p className="plan-more">También podéis: {rest.map(slotText).join(' · ')}</p>}
      <button className="btn btn-primary btn-sm" onClick={() => downloadIcs(first, otherName, idea, matchId)}>
        <CalendarPlus size={16} /> Añadir al calendario
      </button>
      <small className="plan-safety">
        <ShieldCheck size={14} /> Primera cita: un sitio público y avisa a alguien de confianza.
      </small>
    </div>
  );
}
