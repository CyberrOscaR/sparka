// Modo +18: catálogo del "lado picante" del perfil. Solo lo ven personas que también lo han activado.

export const ORIENTATIONS = [
  { id: 'hetero', label: 'Heterosexual' },
  { id: 'gay', label: 'Gay' },
  { id: 'lesbiana', label: 'Lesbiana' },
  { id: 'bi', label: 'Bisexual' },
  { id: 'pan', label: 'Pansexual' },
  { id: 'asexual', label: 'Asexual' },
  { id: 'queer', label: 'Queer' },
  { id: 'otra', label: 'Otra / prefiero no etiquetarme' },
];

export const ADULT_LOOKING_FOR = [
  { id: 'casual', label: '🔥 Sexo casual' },
  { id: 'una_noche', label: '🌙 Algo de una noche' },
  { id: 'fwb', label: '🤝 Amigos con derecho a roce' },
  { id: 'quimica', label: '💞 Pareja con mucha química' },
  { id: 'explorar', label: '🧭 Explorar cosas nuevas' },
  { id: 'abierta', label: '🔓 Relación abierta / no monógama' },
  { id: 'trios', label: '✨ Tríos' },
  { id: 'sexting', label: '📱 Tonteo y sexting' },
];

export const ADULT_PROMPTS = [
  { id: 'me_pone', text: 'Lo que más me pone…' },
  { id: 'en_la_cama', text: 'En la cama soy…' },
  { id: 'fantasia', text: 'Una fantasía que contaría en la primera cita…' },
  { id: 'quiero_probar', text: 'Algo que quiero probar…' },
  { id: 'me_seducen', text: 'Me seducen con…' },
  { id: 'limite', text: 'Mi límite claro es…' },
];

export const ADULT_LIMITS = { maxLookingFor: 5, maxPrompts: 3 };

export const ORIENTATION_IDS = ORIENTATIONS.map((o) => o.id);
export const ADULT_LOOKING_FOR_IDS = ADULT_LOOKING_FOR.map((o) => o.id);
export const ADULT_PROMPT_IDS = ADULT_PROMPTS.map((p) => p.id);

export const orientationById = new Map(ORIENTATIONS.map((o) => [o.id, o]));
export const adultPromptById = new Map(ADULT_PROMPTS.map((p) => [p.id, p]));

/** Lo que otra persona +18 ve de tu lado picante. */
export function publicAdult(adult) {
  return {
    orientation: adult.orientation ?? null,
    lookingFor: adult.lookingFor ?? [],
    prompts: (adult.prompts ?? [])
      .filter((p) => adultPromptById.has(p.id))
      .map((p) => ({ id: p.id, question: adultPromptById.get(p.id).text, answer: p.answer })),
  };
}
