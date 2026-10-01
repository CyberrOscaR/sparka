// Moderación ligera y local: no sustituye a un equipo humano, pero ayuda.

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ');
}

const OFFENSIVE = [
  'idiota', 'estupido', 'estupida', 'imbecil', 'gilipollas', 'subnormal', 'retrasado', 'retrasada',
  'puta', 'puto', 'zorra', 'perra', 'cabron', 'cabrona', 'pendejo', 'pendeja', 'maricon', 'mongolo',
  'gorda asquerosa', 'gordo asqueroso', 'callate ya', 'malparido', 'malparida',
  'hijo de puta', 'hija de puta', 'pajero', 'boludo de mierda', 'concha de tu madre', 'chupame',
];

const SCAM = [
  'transferencia', 'transfiere', 'bizum', 'paypal', 'western union', 'bitcoin', 'cripto', 'criptomoneda',
  'tarjeta de credito', 'numero de tarjeta', 'tarjeta regalo', 'gift card', 'inversion segura',
  'prestame dinero', 'prestarme dinero', 'necesito dinero', 'mandame dinero', 'enviame dinero',
  'codigo de verificacion', 'te mando el codigo', 'whatsapp business', 'binance', 'usdt',
];

function containsAny(normalized, list) {
  const padded = ` ${normalized.replace(/\s+/g, ' ')} `;
  return list.some((term) => padded.includes(` ${term} `));
}

/** Devuelve qué riesgos detectamos en un mensaje. */
export function analyzeMessage(text) {
  const n = normalize(text);
  return {
    offensive: containsAny(n, OFFENSIVE),
    scamRisk: containsAny(n, SCAM),
  };
}
