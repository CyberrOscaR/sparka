const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const longFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' });

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "14:05", "Ayer" o "3 oct". */
export function shortTime(ts) {
  const d = new Date(ts);
  const today = startOfDay(new Date());
  if (ts >= today) return timeFmt.format(d);
  if (ts >= today - 86_400_000) return 'Ayer';
  return dayFmt.format(d);
}

export const clockTime = (ts) => timeFmt.format(new Date(ts));
export const longDate = (ts) => longFmt.format(new Date(ts));

/** Color estable a partir de un id, para los avatares sin foto. */
export function hueFor(id) {
  return (Number(id) * 137.508) % 360;
}

export function initials(name = '') {
  return name.trim().charAt(0).toUpperCase() || '?';
}
