// Moderación ligera y local: no sustituye a un equipo humano, pero ayuda.
// Sparka no censura el sexo entre adultos: solo pide consentimiento. Entre dos personas con el
// Modo +18 el lenguaje sexual fluye sin avisos; a quien no lo ha activado le llega oculto.

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ');
}

// Insultos de verdad: siempre piden confirmación, también en Modo +18 (eso es acoso, no sexo).
const INSULTS = [
  'idiota', 'estupido', 'estupida', 'imbecil', 'gilipollas', 'subnormal', 'retrasado', 'retrasada',
  'cabron', 'cabrona', 'pendejo', 'pendeja', 'maricon', 'mongolo',
  'gorda asquerosa', 'gordo asqueroso', 'callate ya', 'malparido', 'malparida',
  'hijo de puta', 'hija de puta', 'boludo de mierda', 'concha de tu madre',
];

// Fuera de contexto son insultos; entre adultos que lo han elegido, pueden ser parte del juego.
const SEXUAL_INSULTS = ['puta', 'puto', 'zorra', 'perra', 'pajero', 'chupame'];

// Contenido sexual explícito (sin tildes: el texto se normaliza antes).
const SEXUAL = [
  'sexo', 'sexual', 'follar', 'follamos', 'follarte', 'follame', 'cogerte', 'cogemos', 'polla', 'pollas', 'cono',
  'tetas', 'pezones', 'mamada', 'mamadas', 'chupartela', 'chuparte', 'chupamela', 'correrme', 'correrte', 'corrida',
  'orgasmo', 'orgasmos', 'desnudo', 'desnuda', 'desnudos', 'desnudas', 'nudes', 'nude', 'pack', 'cachondo',
  'cachonda', 'paja', 'pajas', 'masturbar', 'masturbarme', 'masturbo', 'condon', 'condones', 'trio', 'penetrar',
  'verga', 'pene', 'vagina', 'clitoris', 'mojada', 'empalmado', 'empalmada', 'sexting', 'fetiche', 'fetiches',
  'bdsm', 'kinky', 'porno', 'lenceria', 'erotico', 'erotica', 'excitado', 'excitada', 'gemir', 'gemidos',
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

/**
 * Qué detectamos en un mensaje:
 * - insult: insulto claro (siempre se confirma).
 * - offensive: insulto o insulto sexual (se confirma fuera del Modo +18).
 * - sexual: contenido sexual (libre entre personas +18; si no, llega oculto).
 * - scamRisk: posible estafa.
 */
export function analyzeMessage(text) {
  const n = normalize(text);
  const insult = containsAny(n, INSULTS);
  const sexualInsult = containsAny(n, SEXUAL_INSULTS);
  return {
    insult,
    offensive: insult || sexualInsult,
    sexual: sexualInsult || containsAny(n, SEXUAL),
    scamRisk: containsAny(n, SCAM),
  };
}
