// Cuestionario de Autocitas: gustos y forma de pensar.
// - 'scale': opciones ordenadas (las vecinas se parecen más que las lejanas).
// - 'multi': varias opciones; se compara cuántas compartís.
// - 'sim': similitud a medida para preguntas que no son una escala simple.
// - sensitive: nunca se muestra (ni en el perfil ni en los motivos), solo cuenta para el porcentaje.

const NO_DECIR = { id: 'nodecir', label: 'Prefiero no decirlo' };

export const AUTOCITA_QUESTIONS = [
  // ---------- Gustos ----------
  {
    id: 'finde',
    group: 'gustos',
    text: 'Tu finde ideal',
    type: 'multi',
    max: 2,
    options: [
      { id: 'casa', label: '🛋️ Plan tranquilo en casa' },
      { id: 'naturaleza', label: '🌲 Naturaleza y aire libre' },
      { id: 'ciudad', label: '🏙️ Ciudad: cultura y terrazas' },
      { id: 'fiesta', label: '🪩 Salir hasta tarde' },
      { id: 'viaje', label: '🧳 Escapada a otro sitio' },
    ],
    reason: (shared) => `Os encanta el mismo finde: ${shared.join(' y ').toLowerCase()}`,
  },
  {
    id: 'musica',
    group: 'gustos',
    text: 'La música que más escuchas',
    type: 'multi',
    max: 3,
    options: [
      { id: 'pop', label: 'Pop' },
      { id: 'rock', label: 'Rock / indie' },
      { id: 'urbano', label: 'Reguetón / urbano' },
      { id: 'electronica', label: 'Electrónica' },
      { id: 'clasica', label: 'Jazz / clásica' },
      { id: 'rap', label: 'Rap / hip hop' },
      { id: 'latina', label: 'Salsa / bachata' },
      { id: 'cantautor', label: 'Cantautores' },
    ],
    reason: (shared) => `Escucháis lo mismo: ${shared.join(', ').toLowerCase()}`,
  },
  {
    id: 'comida',
    group: 'gustos',
    text: 'En la mesa eres…',
    type: 'multi',
    max: 3,
    options: [
      { id: 'todo', label: 'De todo' },
      { id: 'veggie', label: 'Vegetariano/a o vegano/a' },
      { id: 'casera', label: 'Fan de la comida casera' },
      { id: 'restaurantes', label: 'Cazador/a de restaurantes' },
      { id: 'picante', label: 'Cuanto más picante, mejor' },
      { id: 'dulce', label: 'Goloso/a' },
    ],
    reason: (shared) => `En la mesa os entendéis: ${shared.join(', ').toLowerCase()}`,
  },
  {
    id: 'viajes',
    group: 'gustos',
    text: '¿Cuánto viajas?',
    type: 'scale',
    options: [
      { id: 'poco', label: 'Poco, soy de mi sitio' },
      { id: 'algo', label: 'Una o dos veces al año' },
      { id: 'mucho', label: 'Siempre que puedo' },
      { id: 'mochila', label: 'Mochilero/a de corazón' },
    ],
    reason: () => 'Viajáis al mismo ritmo',
  },
  {
    id: 'mascotas',
    group: 'gustos',
    text: 'Los animales en casa',
    type: 'scale',
    options: [
      { id: 'encantan', label: 'Me encantan: tengo o quiero' },
      { id: 'bien', label: 'Bien, sin más' },
      { id: 'sin', label: 'Prefiero sin mascotas' },
    ],
    reason: (_, a) => (a === 'encantan' ? 'Los dos sois de animales' : 'Pensáis igual sobre las mascotas'),
  },
  {
    id: 'deporte',
    group: 'gustos',
    text: 'El deporte en tu vida',
    type: 'scale',
    options: [
      { id: 'nada', label: 'Poco o nada' },
      { id: 'aveces', label: 'A veces' },
      { id: 'semanal', label: 'Varias veces por semana' },
      { id: 'vida', label: 'Es mi vida' },
    ],
    reason: () => 'Lleváis el mismo ritmo con el deporte',
  },
  {
    id: 'social',
    group: 'gustos',
    text: 'Tu batería social',
    type: 'scale',
    options: [
      { id: 'casero', label: 'Muy casero/a' },
      { id: 'equilibrio', label: 'Equilibrio' },
      { id: 'social', label: 'Muy social' },
    ],
    reason: () => 'Tenéis la misma batería social',
  },
  {
    id: 'orden',
    group: 'gustos',
    text: 'Tu casa, normalmente…',
    type: 'scale',
    options: [
      { id: 'caos', label: 'Caos creativo' },
      { id: 'normal', label: 'Ni fu ni fa' },
      { id: 'impecable', label: 'Impecable' },
    ],
    reason: () => 'Convivir no sería un drama: mismo nivel de orden',
  },

  // ---------- Lo que piensas ----------
  {
    id: 'politica',
    group: 'valores',
    sensitive: true,
    text: 'Políticamente te sientes…',
    type: 'scale',
    options: [
      { id: 'izquierda', label: 'De izquierdas' },
      { id: 'centroizq', label: 'De centro-izquierda' },
      { id: 'centro', label: 'De centro' },
      { id: 'centroder', label: 'De centro-derecha' },
      { id: 'derecha', label: 'De derechas' },
    ],
    extra: [{ id: 'apolitico', label: 'Apolítico/a' }, NO_DECIR],
    // Alguien apolítico encaja a medias con todo el mundo (y del todo con otra persona apolítica).
    sim: (a, b, scaleSim) => (a === 'apolitico' || b === 'apolitico' ? (a === b ? 1 : 0.5) : scaleSim(a, b)),
  },
  {
    id: 'religion',
    group: 'valores',
    sensitive: true,
    text: 'Religión o espiritualidad',
    type: 'scale',
    options: [
      { id: 'practicante', label: 'Creyente practicante' },
      { id: 'creyente', label: 'Creyente no practicante' },
      { id: 'espiritual', label: 'Espiritual, sin religión' },
      { id: 'agnostico', label: 'Agnóstico/a' },
      { id: 'ateo', label: 'Ateo/a' },
    ],
    extra: [NO_DECIR],
  },
  {
    id: 'feminismo',
    group: 'valores',
    sensitive: true,
    text: '¿Te consideras feminista?',
    type: 'scale',
    options: [
      { id: 'si', label: 'Sí' },
      { id: 'parte', label: 'En parte' },
      { id: 'no', label: 'No' },
    ],
    extra: [NO_DECIR],
  },
  {
    id: 'relacion',
    group: 'valores',
    sensitive: true,
    text: 'Tipo de relación',
    type: 'scale',
    options: [
      { id: 'mono', label: 'Monogamia' },
      { id: 'hablar', label: 'Lo hablaría' },
      { id: 'abierta', label: 'Relación abierta' },
    ],
    extra: [NO_DECIR],
  },
  {
    id: 'hijos',
    group: 'valores',
    text: '¿Hijos?',
    type: 'choice',
    options: [
      { id: 'quiero', label: 'Quiero tener' },
      { id: 'tengo_mas', label: 'Tengo y quiero más' },
      { id: 'tengo_no', label: 'Tengo y no quiero más' },
      { id: 'no', label: 'No quiero' },
      { id: 'nose', label: 'Aún no lo sé' },
    ],
    // Lo que importa es si queréis (más) hijos en el futuro.
    sim: (a, b) => {
      const future = { quiero: 1, tengo_mas: 1, tengo_no: 0, no: 0, nose: 0.5 };
      return 1 - Math.abs(future[a] - future[b]);
    },
    reason: () => 'Queréis lo mismo sobre tener hijos',
  },
  {
    id: 'ecologia',
    group: 'valores',
    text: 'El cambio climático…',
    type: 'scale',
    options: [
      { id: 'actuo', label: 'Me preocupa y actúo' },
      { id: 'preocupa', label: 'Me preocupa' },
      { id: 'poco', label: 'No me preocupa demasiado' },
    ],
    reason: () => 'Os preocupa lo mismo el planeta',
  },
  {
    id: 'fumar',
    group: 'valores',
    text: '¿Fumas?',
    type: 'scale',
    options: [
      { id: 'no', label: 'No' },
      { id: 'social', label: 'En ocasiones' },
      { id: 'si', label: 'Sí' },
    ],
    reason: (_, a) => (a === 'no' ? 'Ninguno de los dos fuma' : 'Pensáis igual sobre el tabaco'),
  },
  {
    id: 'beber',
    group: 'valores',
    text: '¿Bebes alcohol?',
    type: 'scale',
    options: [
      { id: 'nunca', label: 'Nunca' },
      { id: 'social', label: 'Socialmente' },
      { id: 'frecuente', label: 'Con frecuencia' },
    ],
    reason: () => 'Mismo plan con el alcohol',
  },
  {
    id: 'trabajo',
    group: 'valores',
    text: 'El trabajo en tu vida',
    type: 'scale',
    options: [
      { id: 'primero', label: 'Lo primero' },
      { id: 'equilibrio', label: 'Importante, con equilibrio' },
      { id: 'vivir', label: 'Trabajo para vivir' },
    ],
    reason: () => 'Le dais el mismo peso al trabajo',
  },
  {
    id: 'dinero',
    group: 'valores',
    text: 'Con el dinero eres…',
    type: 'scale',
    options: [
      { id: 'ahorro', label: 'Ahorrador/a' },
      { id: 'equilibrio', label: 'Equilibrado/a' },
      { id: 'momento', label: 'De vivir el momento' },
    ],
    reason: () => 'Gestionáis el dinero parecido',
  },
];

export const IMPORTANCE = {
  igual: { label: 'Me da igual', weight: 0 },
  importa: { label: 'Importa', weight: 1 },
  mucho: { label: 'Mucho', weight: 3 },
  imprescindible: { label: 'Imprescindible', weight: 3, dealbreaker: true },
};

export const autocitaQuestionById = new Map(AUTOCITA_QUESTIONS.map((q) => [q.id, q]));

export function allOptions(q) {
  return [...q.options, ...(q.extra ?? [])];
}

/** Lo que se envía al navegador: sin funciones internas. */
export function publicQuestions() {
  return AUTOCITA_QUESTIONS.map(({ id, group, text, type, max, sensitive, options, extra }) => ({
    id,
    group,
    text,
    type,
    max,
    sensitive: Boolean(sensitive),
    options: [...options, ...(extra ?? [])],
  }));
}
