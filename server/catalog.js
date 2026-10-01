// Datos estáticos compartidos por el servidor y el cliente (vía GET /api/meta).

export const GENDERS = [
  { id: 'mujer', label: 'Mujer' },
  { id: 'hombre', label: 'Hombre' },
  { id: 'no_binario', label: 'No binario' },
];

export const INTENTIONS = [
  { id: 'serio', label: 'Relación seria', emoji: '💞' },
  { id: 'sin_prisa', label: 'Algo serio, sin prisa', emoji: '🌱' },
  { id: 'casual', label: 'Algo casual', emoji: '🔥' },
  { id: 'amistad', label: 'Nuevas amistades', emoji: '🤝' },
  { id: 'descubriendo', label: 'Aún lo estoy descubriendo', emoji: '🧭' },
];

// Lo bien que encajan dos intenciones (simétrico, 0..1).
const INTENTION_FIT = {
  'serio|serio': 1,
  'serio|sin_prisa': 0.75,
  'serio|casual': 0.1,
  'serio|amistad': 0.15,
  'serio|descubriendo': 0.4,
  'sin_prisa|sin_prisa': 1,
  'sin_prisa|casual': 0.35,
  'sin_prisa|amistad': 0.2,
  'sin_prisa|descubriendo': 0.65,
  'casual|casual': 1,
  'casual|amistad': 0.2,
  'casual|descubriendo': 0.6,
  'amistad|amistad': 1,
  'amistad|descubriendo': 0.35,
  'descubriendo|descubriendo': 0.85,
};

export function intentionFit(a, b) {
  if (!a || !b) return 0.5;
  return INTENTION_FIT[`${a}|${b}`] ?? INTENTION_FIT[`${b}|${a}`] ?? 0.3;
}

export const INTERESTS = [
  { id: 'senderismo', label: 'Senderismo', emoji: '🥾' },
  { id: 'viajar', label: 'Viajar', emoji: '✈️' },
  { id: 'cocinar', label: 'Cocinar', emoji: '🍳' },
  { id: 'cafe', label: 'Café de especialidad', emoji: '☕' },
  { id: 'vino', label: 'Vino', emoji: '🍷' },
  { id: 'cerveza', label: 'Cerveza artesanal', emoji: '🍺' },
  { id: 'gastronomia', label: 'Gastronomía', emoji: '🍣' },
  { id: 'yoga', label: 'Yoga', emoji: '🧘' },
  { id: 'gimnasio', label: 'Gimnasio', emoji: '🏋️' },
  { id: 'correr', label: 'Correr', emoji: '🏃' },
  { id: 'ciclismo', label: 'Ciclismo', emoji: '🚴' },
  { id: 'futbol', label: 'Fútbol', emoji: '⚽' },
  { id: 'baloncesto', label: 'Baloncesto', emoji: '🏀' },
  { id: 'padel', label: 'Pádel', emoji: '🎾' },
  { id: 'natacion', label: 'Natación', emoji: '🏊' },
  { id: 'surf', label: 'Surf', emoji: '🏄' },
  { id: 'escalada', label: 'Escalada', emoji: '🧗' },
  { id: 'esqui', label: 'Esquí', emoji: '⛷️' },
  { id: 'bailar', label: 'Bailar', emoji: '💃' },
  { id: 'conciertos', label: 'Conciertos', emoji: '🎤' },
  { id: 'festivales', label: 'Festivales', emoji: '🎪' },
  { id: 'indie', label: 'Música indie', emoji: '🎸' },
  { id: 'reggaeton', label: 'Reguetón', emoji: '🔊' },
  { id: 'jazz', label: 'Jazz', emoji: '🎷' },
  { id: 'electronica', label: 'Electrónica', emoji: '🎧' },
  { id: 'cine', label: 'Cine', emoji: '🎬' },
  { id: 'series', label: 'Series', emoji: '📺' },
  { id: 'anime', label: 'Anime', emoji: '🍥' },
  { id: 'videojuegos', label: 'Videojuegos', emoji: '🎮' },
  { id: 'juegos_mesa', label: 'Juegos de mesa', emoji: '🎲' },
  { id: 'lectura', label: 'Lectura', emoji: '📚' },
  { id: 'escritura', label: 'Escritura', emoji: '✍️' },
  { id: 'fotografia', label: 'Fotografía', emoji: '📷' },
  { id: 'arte', label: 'Arte', emoji: '🎨' },
  { id: 'museos', label: 'Museos', emoji: '🏛️' },
  { id: 'teatro', label: 'Teatro', emoji: '🎭' },
  { id: 'moda', label: 'Moda', emoji: '👗' },
  { id: 'tecnologia', label: 'Tecnología', emoji: '💻' },
  { id: 'ciencia', label: 'Ciencia', emoji: '🔬' },
  { id: 'astronomia', label: 'Astronomía', emoji: '🔭' },
  { id: 'filosofia', label: 'Filosofía', emoji: '🤔' },
  { id: 'voluntariado', label: 'Voluntariado', emoji: '🤝' },
  { id: 'perros', label: 'Perros', emoji: '🐶' },
  { id: 'gatos', label: 'Gatos', emoji: '🐱' },
  { id: 'plantas', label: 'Plantas', emoji: '🪴' },
  { id: 'sostenibilidad', label: 'Sostenibilidad', emoji: '♻️' },
  { id: 'vegano', label: 'Cocina vegana', emoji: '🌱' },
  { id: 'playa', label: 'Playa', emoji: '🏖️' },
  { id: 'montana', label: 'Montaña', emoji: '🏔️' },
  { id: 'camping', label: 'Camping', emoji: '⛺' },
  { id: 'karaoke', label: 'Karaoke', emoji: '🎙️' },
  { id: 'comedia', label: 'Stand-up', emoji: '😂' },
  { id: 'meditacion', label: 'Meditación', emoji: '🕯️' },
  { id: 'idiomas', label: 'Idiomas', emoji: '🗣️' },
  { id: 'emprender', label: 'Emprender', emoji: '🚀' },
];

export const PROMPTS = [
  { id: 'domingo', text: 'Mi plan de domingo ideal es…' },
  { id: 'reir', text: 'Lo que más me hace reír…' },
  { id: 'enamoro', text: 'Me enamoro de quien…' },
  { id: 'impopular', text: 'Una opinión impopular que tengo…' },
  { id: 'talento', text: 'Mi talento oculto…' },
  { id: 'primera_cita', text: 'La primera cita perfecta sería…' },
  { id: 'aburrir', text: 'No te vas a aburrir conmigo porque…' },
  { id: 'karaoke', text: 'Mi canción para el karaoke es…' },
  { id: 'espontaneo', text: 'Lo más espontáneo que he hecho…' },
  { id: 'corazon', text: 'Te ganarás mi corazón si…' },
  { id: 'banderas', text: 'Mi bandera verde es…' },
  { id: 'aprendiendo', text: 'Ahora mismo estoy aprendiendo…' },
];

export const CITIES = [
  { id: 'madrid', label: 'Madrid', country: 'España', lat: 40.4168, lng: -3.7038 },
  { id: 'barcelona', label: 'Barcelona', country: 'España', lat: 41.3874, lng: 2.1686 },
  { id: 'valencia', label: 'Valencia', country: 'España', lat: 39.4699, lng: -0.3763 },
  { id: 'sevilla', label: 'Sevilla', country: 'España', lat: 37.3891, lng: -5.9845 },
  { id: 'malaga', label: 'Málaga', country: 'España', lat: 36.7213, lng: -4.4214 },
  { id: 'bilbao', label: 'Bilbao', country: 'España', lat: 43.263, lng: -2.935 },
  { id: 'zaragoza', label: 'Zaragoza', country: 'España', lat: 41.6488, lng: -0.8891 },
  { id: 'cdmx', label: 'Ciudad de México', country: 'México', lat: 19.4326, lng: -99.1332 },
  { id: 'guadalajara', label: 'Guadalajara', country: 'México', lat: 20.6597, lng: -103.3496 },
  { id: 'monterrey', label: 'Monterrey', country: 'México', lat: 25.6866, lng: -100.3161 },
  { id: 'bogota', label: 'Bogotá', country: 'Colombia', lat: 4.711, lng: -74.0721 },
  { id: 'medellin', label: 'Medellín', country: 'Colombia', lat: 6.2442, lng: -75.5812 },
  { id: 'buenos_aires', label: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lng: -58.3816 },
  { id: 'santiago', label: 'Santiago', country: 'Chile', lat: -33.4489, lng: -70.6693 },
  { id: 'lima', label: 'Lima', country: 'Perú', lat: -12.0464, lng: -77.0428 },
  { id: 'quito', label: 'Quito', country: 'Ecuador', lat: -0.1807, lng: -78.4678 },
  { id: 'caracas', label: 'Caracas', country: 'Venezuela', lat: 10.4806, lng: -66.9036 },
  { id: 'montevideo', label: 'Montevideo', country: 'Uruguay', lat: -34.9011, lng: -56.1645 },
  { id: 'san_jose', label: 'San José', country: 'Costa Rica', lat: 9.9281, lng: -84.0907 },
  { id: 'miami', label: 'Miami', country: 'EE. UU.', lat: 25.7617, lng: -80.1918 },
];

export const REPORT_REASONS = [
  { id: 'perfil_falso', label: 'Perfil falso o suplantación' },
  { id: 'acoso', label: 'Acoso o mensajes ofensivos' },
  { id: 'contenido', label: 'Fotos o contenido inapropiado' },
  { id: 'menor', label: 'Parece menor de edad' },
  { id: 'estafa', label: 'Estafa o petición de dinero' },
  { id: 'otro', label: 'Otro motivo' },
];

export const LIMITS = {
  superlikesPerDay: 3,
  maxPhotos: 6,
  minInterests: 3,
  maxInterests: 10,
  maxPrompts: 3,
  minAge: 18,
  maxAge: 99,
  maxDistanceKm: 500,
};

export const GENDER_IDS = GENDERS.map((g) => g.id);
export const INTENTION_IDS = INTENTIONS.map((i) => i.id);
export const INTEREST_IDS = INTERESTS.map((i) => i.id);
export const PROMPT_IDS = PROMPTS.map((p) => p.id);
export const CITY_IDS = CITIES.map((c) => c.id);
export const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id);

export const interestById = new Map(INTERESTS.map((i) => [i.id, i]));
export const intentionById = new Map(INTENTIONS.map((i) => [i.id, i]));
export const promptById = new Map(PROMPTS.map((p) => [p.id, p]));
export const cityById = new Map(CITIES.map((c) => [c.id, c]));
