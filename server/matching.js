import { CITIES, interestById, intentionById, intentionFit, promptById } from './catalog.js';

const DAY = 24 * 60 * 60 * 1000;

export function ageFrom(birthdate, now = new Date()) {
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split('-').map(Number);
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestCity(lat, lng) {
  let best = CITIES[0];
  let bestDist = Infinity;
  for (const city of CITIES) {
    const d = distanceKm(lat, lng, city.lat, city.lng);
    if (d < bestDist) {
      best = city;
      bestDist = d;
    }
  }
  return best;
}

/** Convierte una fila de `profiles` en un objeto con los JSON ya parseados. */
export function parseProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    name: row.name,
    birthdate: row.birthdate,
    age: ageFrom(row.birthdate),
    gender: row.gender,
    showMe: JSON.parse(row.show_me),
    intention: row.intention,
    bio: row.bio,
    job: row.job,
    city: row.city,
    lat: row.lat,
    lng: row.lng,
    interests: JSON.parse(row.interests),
    prompts: JSON.parse(row.prompts),
    ageMin: row.age_min,
    ageMax: row.age_max,
    maxDistanceKm: row.max_distance_km,
    filterIntentions: JSON.parse(row.filter_intentions),
    incognito: Boolean(row.incognito),
    isDemo: Boolean(row.is_demo),
    completed: Boolean(row.completed),
    lastActive: row.last_active,
  };
}

export function isProfileComplete(p) {
  return Boolean(
    p.name &&
      p.birthdate &&
      p.gender &&
      p.showMe.length > 0 &&
      p.intention &&
      p.interests.length >= 3 &&
      p.prompts.length >= 1 &&
      p.lat != null &&
      p.lng != null,
  );
}

/** ¿Se ven mutuamente por género y edad? (Las dos personas tienen que encajar en lo que busca la otra.) */
export function mutuallyEligible(me, other) {
  if (!me.showMe.includes(other.gender) || !other.showMe.includes(me.gender)) return false;
  if (other.age < me.ageMin || other.age > me.ageMax) return false;
  if (me.age < other.ageMin || me.age > other.ageMax) return false;
  return true;
}

function activityScore(lastActive, now) {
  const elapsed = now - lastActive;
  if (elapsed < DAY) return 1;
  if (elapsed < 3 * DAY) return 0.75;
  if (elapsed < 7 * DAY) return 0.5;
  return 0.2;
}

export function activityLabel(lastActive, now = Date.now()) {
  const elapsed = now - lastActive;
  if (elapsed < 15 * 60 * 1000) return 'Activo ahora';
  if (elapsed < DAY) return 'Activo hoy';
  if (elapsed < 7 * DAY) return 'Activo esta semana';
  return null;
}

/**
 * Compatibilidad transparente: devolvemos la puntuación y también el porqué,
 * para que la gente entienda por qué ve a cada persona.
 */
export function compatibility(me, other, distance, now = Date.now()) {
  const shared = me.interests.filter((i) => other.interests.includes(i));
  const denom = Math.sqrt(Math.max(me.interests.length, 1) * Math.max(other.interests.length, 1));
  const interestScore = Math.min(1, shared.length / denom);
  const intentScore = intentionFit(me.intention, other.intention);
  const distanceScore = Math.max(0, 1 - distance / Math.max(me.maxDistanceKm, 1));
  const total =
    0.45 * interestScore + 0.3 * intentScore + 0.15 * distanceScore + 0.1 * activityScore(other.lastActive, now);

  const reasons = [];
  if (shared.length > 0) {
    const names = shared.slice(0, 3).map((id) => interestById.get(id)?.label.toLowerCase());
    reasons.push(`${shared.length === 1 ? 'Os gusta' : 'Compartís'}: ${names.join(', ')}`);
  }
  if (me.intention && me.intention === other.intention) {
    reasons.push(`Buscáis lo mismo: ${intentionById.get(me.intention)?.label.toLowerCase()}`);
  } else if (intentScore >= 0.6) {
    reasons.push('Vuestras intenciones encajan');
  }
  if (distance < 5) reasons.push('Muy cerca de ti');

  return { score: Math.round(Math.max(0, Math.min(1, total)) * 100), reasons, sharedInterests: shared };
}

export function roundDistance(km) {
  // Nunca revelamos la distancia exacta: redondeamos para proteger la ubicación.
  if (km < 2) return 1;
  if (km < 10) return Math.round(km);
  return Math.round(km / 5) * 5;
}

/** Lo que ve otra persona de un perfil. Nunca incluye email, fecha de nacimiento ni coordenadas. */
export function publicProfile(p, photos, viewer, now = Date.now()) {
  const out = {
    id: p.userId,
    name: p.name,
    age: p.age,
    gender: p.gender,
    intention: p.intention,
    bio: p.bio,
    job: p.job,
    city: p.city,
    interests: p.interests,
    prompts: p.prompts
      .filter((pr) => promptById.has(pr.id))
      .map((pr) => ({ id: pr.id, question: promptById.get(pr.id).text, answer: pr.answer })),
    photos,
    isDemo: p.isDemo,
    activity: activityLabel(p.lastActive, now),
  };
  if (viewer && viewer.lat != null && p.lat != null) {
    const d = distanceKm(viewer.lat, viewer.lng, p.lat, p.lng);
    out.distanceKm = roundDistance(d);
    out.compatibility = compatibility(viewer, p, d, now);
  }
  return out;
}

export function boundingBox(lat, lng, km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { latMin: lat - dLat, latMax: lat + dLat, lngMin: lng - dLng, lngMax: lng + dLng };
}
