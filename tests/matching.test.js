import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { intentionFit } from '../server/catalog.js';
import { ageFrom, compatibility, distanceKm, mutuallyEligible, nearestCity, roundDistance } from '../server/matching.js';
import { analyzeMessage } from '../server/safety.js';

const profile = (overrides) => ({
  gender: 'hombre',
  showMe: ['mujer'],
  age: 30,
  ageMin: 25,
  ageMax: 35,
  intention: 'serio',
  interests: ['cafe', 'cine', 'viajar'],
  maxDistanceKm: 50,
  lastActive: Date.now(),
  ...overrides,
});

describe('matching', () => {
  it('calcula la edad teniendo en cuenta el cumpleaños', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    assert.equal(ageFrom('2000-06-15', now), 26);
    assert.equal(ageFrom('2000-06-16', now), 25);
    assert.equal(ageFrom(null, now), null);
  });

  it('calcula distancias reales', () => {
    const d = distanceKm(40.4168, -3.7038, 41.3874, 2.1686);
    assert.ok(d > 495 && d < 510, `Madrid–Barcelona: ${d}`);
    assert.equal(nearestCity(40.45, -3.69).label, 'Madrid');
  });

  it('redondea la distancia para no revelar la ubicación exacta', () => {
    assert.equal(roundDistance(0.3), 1);
    assert.equal(roundDistance(7.4), 7);
    assert.equal(roundDistance(23), 25);
  });

  it('exige compatibilidad mutua de género y edad', () => {
    const me = profile();
    assert.ok(mutuallyEligible(me, profile({ gender: 'mujer', showMe: ['hombre'], age: 28 })));
    assert.ok(!mutuallyEligible(me, profile({ gender: 'mujer', showMe: ['mujer'], age: 28 })));
    assert.ok(!mutuallyEligible(me, profile({ gender: 'mujer', showMe: ['hombre'], age: 40 })));
    assert.ok(!mutuallyEligible(me, profile({ gender: 'mujer', showMe: ['hombre'], age: 28, ageMax: 29 })));
  });

  it('la compatibilidad premia intereses e intenciones compartidas y explica por qué', () => {
    const me = profile();
    const similar = profile({ interests: ['cafe', 'cine', 'yoga'], intention: 'serio' });
    const different = profile({ interests: ['futbol', 'anime', 'surf'], intention: 'casual' });
    const a = compatibility(me, similar, 3);
    const b = compatibility(me, different, 3);
    assert.ok(a.score > b.score);
    assert.deepEqual(a.sharedInterests, ['cafe', 'cine']);
    assert.ok(a.reasons.some((r) => r.includes('café de especialidad')));
    assert.ok(a.reasons.some((r) => r.includes('relación seria')));
    assert.ok(a.score >= 0 && a.score <= 100);
  });

  it('el encaje de intenciones es simétrico', () => {
    assert.equal(intentionFit('serio', 'casual'), intentionFit('casual', 'serio'));
    assert.equal(intentionFit('amistad', 'amistad'), 1);
  });
});

describe('moderación', () => {
  it('detecta insultos aunque lleven tildes o mayúsculas', () => {
    assert.equal(analyzeMessage('Eres un IMBÉCIL').offensive, true);
    assert.equal(analyzeMessage('Eres una estúpida').offensive, true);
    assert.equal(analyzeMessage('Me encantó tu foto en la montaña').offensive, false);
  });

  it('marca posibles estafas sin dar falsos positivos obvios', () => {
    assert.equal(analyzeMessage('Hazme una transferencia porfa').scamRisk, true);
    assert.equal(analyzeMessage('¿Tienes PayPal?').scamRisk, true);
    assert.equal(analyzeMessage('Me encanta viajar en tren').scamRisk, false);
    assert.equal(analyzeMessage('Te debo una cerveza').scamRisk, false);
  });
});
