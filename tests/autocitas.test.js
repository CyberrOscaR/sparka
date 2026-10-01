import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AUTOCITA_QUESTIONS } from '../server/autocitaQuestions.js';
import { AUTOCITA_THRESHOLD, MAX_PENDING, deepScore, questionSimilarity, reasonsFor } from '../server/autocitas.js';
import { setup, wait } from './helpers.js';

const man = { gender: 'hombre', showMe: ['mujer'] };
const woman = { gender: 'mujer', showMe: ['hombre'] };
const q = (id) => AUTOCITA_QUESTIONS.find((x) => x.id === id);

// Un cuestionario completo "tipo" y otro casi opuesto.
const NATURE = {
  finde: ['naturaleza', 'viaje'], musica: ['rock', 'electronica'], comida: ['todo', 'picante'], viajes: 'mochila',
  mascotas: 'encantan', deporte: 'vida', social: 'social', orden: 'normal', politica: 'izquierda', religion: 'agnostico',
  feminismo: 'si', relacion: 'mono', hijos: 'nose', ecologia: 'actuo', fumar: 'no', beber: 'social', trabajo: 'vivir',
  dinero: 'momento',
};
const OPPOSITE = {
  finde: ['casa'], musica: ['urbano'], comida: ['dulce'], viajes: 'poco', mascotas: 'sin', deporte: 'nada',
  social: 'casero', orden: 'impecable', politica: 'derecha', religion: 'practicante', feminismo: 'no', relacion: 'abierta',
  hijos: 'quiero', ecologia: 'poco', fumar: 'si', beber: 'frecuente', trabajo: 'primero', dinero: 'ahorro',
};
const form = (values, overrides = {}) =>
  Object.fromEntries(Object.entries({ ...values, ...overrides }).map(([k, v]) => [k, { value: v, importance: 'importa' }]));

describe('Autocitas: afinidad profunda', () => {
  it('compara escalas, opciones múltiples y casos especiales', () => {
    assert.equal(questionSimilarity(q('politica'), 'izquierda', 'izquierda'), 1);
    assert.equal(questionSimilarity(q('politica'), 'izquierda', 'derecha'), 0);
    assert.equal(questionSimilarity(q('politica'), 'izquierda', 'centroizq'), 0.75);
    assert.equal(questionSimilarity(q('politica'), 'apolitico', 'derecha'), 0.5);
    assert.equal(questionSimilarity(q('politica'), 'nodecir', 'derecha'), null, '"prefiero no decirlo" no cuenta');
    assert.equal(questionSimilarity(q('hijos'), 'quiero', 'tengo_mas'), 1);
    assert.equal(questionSimilarity(q('hijos'), 'quiero', 'no'), 0);
    assert.equal(questionSimilarity(q('finde'), ['naturaleza', 'viaje'], ['viaje']), 1);
    assert.equal(questionSimilarity(q('finde'), ['naturaleza', 'viaje'], ['casa', 'viaje']), 0.5);
  });

  it('puntúa alto a quien piensa igual y bajo a quien piensa lo contrario', () => {
    const P = { intention: 'serio' };
    assert.equal(deepScore(form(NATURE), form(NATURE), P, P).score, 100);
    assert.ok(deepScore(form(NATURE), form(OPPOSITE), P, P).score < 20);
    const similar = form(NATURE, { politica: 'centroizq', deporte: 'semanal', orden: 'caos' });
    assert.ok(deepScore(form(NATURE), similar, P, P).score >= AUTOCITA_THRESHOLD);
  });

  it('un "imprescindible" que no se cumple bloquea la autocita', () => {
    const P = { intention: 'serio' };
    const strict = form(NATURE);
    strict.fumar.importance = 'imprescindible';
    const smoker = form(NATURE, { fumar: 'si' });
    const result = deepScore(strict, smoker, P, P);
    assert.equal(result.dealbreak, true);
    assert.ok(result.score < AUTOCITA_THRESHOLD);
  });

  it('necesita suficientes respuestas en común', () => {
    const few = Object.fromEntries(Object.entries(form(NATURE)).slice(0, 5));
    assert.equal(deepScore(few, form(NATURE)), null);
  });

  it('los motivos nunca nombran política, religión ni otros temas sensibles', () => {
    const r = deepScore(form(NATURE), form(NATURE));
    const reasons = reasonsFor(form(NATURE), form(NATURE), r.sims);
    assert.ok(reasons.length >= 2);
    assert.ok(reasons.includes('Vuestros valores encajan'));
    for (const text of reasons) assert.doesNotMatch(text, /izquierda|agnóstic|feminis|monogam|polític|religi/i);
  });
});

describe('Autocitas: propuestas y citas', () => {
  let t;
  before(() => (t = setup()));
  after(() => t.cleanup());

  const save = (u, answers, enabled = true) => u.agent.put('/api/autocitas').send({ enabled, answers });

  it('valida el cuestionario', async () => {
    const u = await t.user({ ...man, location: { city: 'madrid' } });
    const state = (await u.agent.get('/api/autocitas').expect(200)).body;
    assert.equal(state.enabled, false);
    assert.equal(state.questions.length, AUTOCITA_QUESTIONS.length);
    assert.ok(state.questions.find((x) => x.id === 'politica').sensitive);
    await save(u, { inventada: { value: 'x', importance: 'importa' } }).expect(400);
    await save(u, { finde: { value: ['casa', 'fiesta', 'viaje'], importance: 'importa' } }).expect(400);
    await save(u, { politica: { value: 'anarquia', importance: 'importa' } }).expect(400);
    await save(u, { politica: { value: 'izquierda', importance: 'muchisimo' } }).expect(400);
    const res = await save(u, { politica: { value: 'izquierda', importance: 'importa' } }).expect(400);
    assert.match(res.body.error, /al menos 8/);
    await save(u, { politica: { value: 'izquierda', importance: 'importa' } }, false).expect(200);
  });

  it('propone una autocita a dos personas compatibles al 65 % o más, y a nadie más', async () => {
    const a = await t.user({ ...man, location: { city: 'sevilla' } });
    const b = await t.user({ ...woman, location: { city: 'sevilla' } });
    const opposite = await t.user({ ...woman, location: { city: 'sevilla' } });
    const notEnabled = await t.user({ ...woman, location: { city: 'sevilla' } });
    await save(opposite, form(OPPOSITE)).expect(200);
    await save(notEnabled, form(NATURE), false).expect(200);
    await save(b, form(NATURE, { politica: 'centroizq' })).expect(200);

    const res = (await save(a, form(NATURE)).expect(200)).body;
    assert.equal(res.created, 1);
    assert.equal(res.proposals.length, 1);
    const p = res.proposals[0];
    assert.equal(p.user.id, b.id);
    assert.ok(p.score >= 65);
    assert.ok(p.plan.idea);
    assert.ok(p.reasons.length > 0);
    assert.equal(p.myResponse, null);

    // Privacidad: B ve la propuesta, pero nunca las respuestas de A.
    const bState = (await b.agent.get('/api/autocitas')).body;
    assert.equal(bState.proposals[0].user.id, a.id);
    assert.equal(bState.answers.politica.value, 'centroizq', 'solo sus propias respuestas');
    assert.equal(JSON.stringify(bState.proposals).includes('izquierda'), false);
    assert.equal((await b.agent.get('/api/me/counts')).body.autocitas, 1);
  });

  it('si los dos se apuntan: chat abierto, plan y Coincidir en marcha', async () => {
    const a = await t.user({ ...man, location: { city: 'bilbao' } });
    const b = await t.user({ ...woman, location: { city: 'bilbao' } });
    await save(b, form(NATURE)).expect(200);
    const { proposals } = (await save(a, form(NATURE)).expect(200)).body;
    const id = proposals[0].id;

    const first = (await a.agent.post(`/api/autocitas/${id}/respond`).send({ answer: 'yes' }).expect(200)).body;
    assert.deepEqual(first, { matched: false, waiting: true });
    await a.agent.post(`/api/autocitas/${id}/respond`).send({ answer: 'yes' }).expect(409);
    assert.equal((await b.agent.get('/api/autocitas')).body.proposals[0].myResponse, null, 'el sí de A es secreto');

    const second = (await b.agent.post(`/api/autocitas/${id}/respond`).send({ answer: 'yes' }).expect(200)).body;
    assert.equal(second.matched, true);
    assert.equal(second.match.source, 'auto');
    const matchId = second.match.id;

    const intro = (await a.agent.get(`/api/matches/${matchId}/messages`)).body.messages[0];
    assert.equal(intro.kind, 'autocita');
    assert.equal(intro.data.score, proposals[0].score);
    assert.ok(intro.data.idea);
    const view = (await a.agent.get(`/api/matches/${matchId}`)).body;
    assert.equal(view.source, 'auto');
    assert.equal(view.coincide.mySlots, null, 'Coincidir arranca solo');
    assert.equal((await a.agent.get('/api/autocitas')).body.proposals.length, 0);
  });

  it('un "no" la retira y esa pareja no se vuelve a proponer', async () => {
    const a = await t.user({ ...man, location: { city: 'malaga' } });
    const b = await t.user({ ...woman, location: { city: 'malaga' } });
    await save(b, form(NATURE)).expect(200);
    const id = (await save(a, form(NATURE))).body.proposals[0].id;
    await a.agent.post(`/api/autocitas/${id}/respond`).send({ answer: 'yes' }).expect(200);
    await b.agent.post(`/api/autocitas/${id}/respond`).send({ answer: 'no' }).expect(200);
    assert.equal((await a.agent.get('/api/autocitas')).body.proposals.length, 0);
    await save(a, form(NATURE)).expect(200);
    assert.equal((await b.agent.get('/api/autocitas')).body.proposals.length, 0);
    await b.agent.post(`/api/autocitas/${id}/respond`).send({ answer: 'yes' }).expect(409);
  });

  it('respeta bloqueos, desactivación y el máximo de propuestas abiertas', async () => {
    const a = await t.user({ ...man, location: { city: 'quito' } });
    const blocked = await t.user({ ...woman, location: { city: 'quito' } });
    await a.agent.post(`/api/users/${blocked.id}/block`).expect(200);
    await save(blocked, form(NATURE)).expect(200);
    const others = [];
    for (let i = 0; i < MAX_PENDING + 1; i++) {
      const o = await t.user({ ...woman, location: { city: 'quito' } });
      await save(o, form(NATURE)).expect(200);
      others.push(o);
    }
    const res = (await save(a, form(NATURE))).body;
    assert.equal(res.proposals.length, MAX_PENDING);
    assert.ok(!res.proposals.some((p) => p.user.id === blocked.id));

    await save(a, form(NATURE), false).expect(200);
    assert.equal((await others[0].agent.get('/api/autocitas')).body.proposals.length, 0, 'al desactivar se retiran');
    const outsider = await t.user({ ...man, location: { city: 'quito' } });
    await outsider.agent.post(`/api/autocitas/${res.proposals[0].id}/respond`).send({ answer: 'yes' }).expect(404);
  });
});

describe('Autocitas en modo demo', () => {
  let t;
  before(() => (t = setup({ demoMode: true, demoRandom: () => 0, demoReplyDelayMs: [0, 0] })));
  after(() => t.cleanup());

  it('los perfiles demo tienen cuestionario y se apuntan a la autocita', async () => {
    const u = await t.user({ ...man, location: { city: 'madrid' } });
    const NATURE_DEMO = { ...NATURE, politica: 'centro' }; // como uno de los "tipos" demo
    const res = (await u.agent.put('/api/autocitas').send({ enabled: true, answers: form(NATURE_DEMO) }).expect(200)).body;
    assert.ok(res.proposals.length > 0, 'hay alguien compatible cerca');
    const p = res.proposals[0];
    assert.ok(p.user.isDemo);
    await wait(100); // el perfil demo responde
    const done = (await u.agent.post(`/api/autocitas/${p.id}/respond`).send({ answer: 'yes' }).expect(200)).body;
    assert.equal(done.matched, true);
  });
});
