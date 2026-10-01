import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AUTOCITA_QUESTIONS } from '../server/autocitaQuestions.js';
import { deepScore, questionSimilarity, reasonsFor } from '../server/autocitas.js';
import { analyzeMessage } from '../server/safety.js';
import { setup, wait } from './helpers.js';

const man = { gender: 'hombre', showMe: ['mujer'] };
const woman = { gender: 'mujer', showMe: ['hombre'] };
const q = (id) => AUTOCITA_QUESTIONS.find((x) => x.id === id);
const ADULT = {
  enabled: true,
  consent: true,
  orientation: 'hetero',
  lookingFor: ['casual', 'explorar'],
  prompts: [{ id: 'me_pone', answer: 'Los besos en el cuello.' }],
};

describe('Modo +18: moderación con consentimiento', () => {
  it('distingue insultos, lenguaje sexual y estafas', () => {
    const insult = analyzeMessage('eres un imbécil');
    assert.equal(insult.insult, true);
    assert.equal(insult.sexual, false);
    const sexual = analyzeMessage('Me muero de ganas de follarte');
    assert.equal(sexual.sexual, true);
    assert.equal(sexual.offensive, false);
    const dirty = analyzeMessage('Dime que eres mi zorra');
    assert.equal(dirty.sexual, true);
    assert.equal(dirty.insult, false, 'en Modo +18 puede ser parte del juego');
    assert.equal(dirty.offensive, true, 'fuera del Modo +18 sigue siendo un insulto');
    assert.equal(analyzeMessage('¿Quedamos para un café caliente?').sexual, false);
  });
});

describe('Modo +18: perfil, filtros y chat', () => {
  let t;
  before(() => (t = setup()));
  after(() => t.cleanup());

  it('activarlo exige consentimiento expreso y valida el lado picante', async () => {
    const u = await t.user({ ...man });
    await u.agent.put('/api/me/adult').send({ enabled: true }).expect(400);
    await u.agent.put('/api/me/adult').send({ ...ADULT, lookingFor: ['orgias_lunares'] }).expect(400);
    await u.agent.put('/api/me/adult').send({ ...ADULT, prompts: [{ id: 'me_pone', answer: 'x'.repeat(201) }] }).expect(400);
    const res = (await u.agent.put('/api/me/adult').send(ADULT).expect(200)).body;
    assert.equal(res.adult.enabled, true);
    assert.deepEqual(res.adult.lookingFor, ['casual', 'explorar']);
    assert.equal(res.preview.adult.prompts[0].question, 'Lo que más me pone…', 'tu vista previa lo incluye');
    // Desactivar no pide nada y guarda tus respuestas para cuando vuelvas.
    const off = (await u.agent.put('/api/me/adult').send({ enabled: false }).expect(200)).body;
    assert.equal(off.adult.enabled, false);
    assert.equal(off.adult.prompts.length, 1);
  });

  it('el lado picante solo lo ven personas que también tienen el Modo +18', async () => {
    const hot = await t.user({ ...woman, location: { city: 'valencia' } });
    const hotViewer = await t.user({ ...man, location: { city: 'valencia' } });
    const plainViewer = await t.user({ ...man, location: { city: 'valencia' } });
    await hot.agent.put('/api/me/adult').send(ADULT).expect(200);
    await hotViewer.agent.put('/api/me/adult').send({ ...ADULT, orientation: 'bi' }).expect(200);

    const seenByHot = (await hotViewer.agent.get('/api/discover')).body.profiles.find((p) => p.id === hot.id);
    assert.deepEqual(seenByHot.adult.lookingFor, ['casual', 'explorar']);
    assert.equal(seenByHot.adult.prompts[0].answer, 'Los besos en el cuello.');
    const seenByPlain = (await plainViewer.agent.get('/api/discover')).body.profiles.find((p) => p.id === hot.id);
    assert.equal(seenByPlain.adult, undefined);
    assert.equal(JSON.stringify(seenByPlain).includes('besos en el cuello'), false);
  });

  it('filtro "solo perfiles +18" (solo con el modo activado)', async () => {
    const viewer = await t.user({ ...man, location: { city: 'zaragoza' } });
    const hot = await t.user({ ...woman, location: { city: 'zaragoza' } });
    const plain = await t.user({ ...woman, location: { city: 'zaragoza' } });
    await hot.agent.put('/api/me/adult').send(ADULT).expect(200);
    let res = (await viewer.agent.put('/api/me/preferences').send({ onlyAdult: true }).expect(200)).body;
    assert.equal(res.preferences.onlyAdult, false, 'sin Modo +18 no se puede activar');
    await viewer.agent.put('/api/me/adult').send(ADULT).expect(200);
    res = (await viewer.agent.put('/api/me/preferences').send({ onlyAdult: true }).expect(200)).body;
    assert.equal(res.preferences.onlyAdult, true);
    const ids = (await viewer.agent.get('/api/discover')).body.profiles.map((p) => p.id);
    assert.ok(ids.includes(hot.id));
    assert.ok(!ids.includes(plain.id));
  });

  async function pair(city, { adultA, adultB }) {
    const a = await t.user({ ...man, location: { city } });
    const b = await t.user({ ...woman, location: { city } });
    if (adultA) await a.agent.put('/api/me/adult').send(ADULT).expect(200);
    if (adultB) await b.agent.put('/api/me/adult').send(ADULT).expect(200);
    await a.agent.post('/api/swipes').send({ targetId: b.id, action: 'like' });
    const { match } = (await b.agent.post('/api/swipes').send({ targetId: a.id, action: 'like' })).body;
    return { a, b, id: match.id };
  }

  it('entre dos personas +18 el chat es sin filtros (los insultos de verdad siguen avisando)', async () => {
    const { a, id } = await pair('sevilla', { adultA: true, adultB: true });
    assert.equal((await a.agent.get(`/api/matches/${id}`)).body.adultPair, true);
    const sexual = await a.agent.post(`/api/matches/${id}/messages`).send({ body: 'Tengo ganas de follarte' }).expect(201);
    assert.equal(sexual.body.message.flag, null);
    const dirty = await a.agent.post(`/api/matches/${id}/messages`).send({ body: 'Vas a ser mi zorra' }).expect(201);
    assert.equal(dirty.body.message.flag, null);
    const insult = await a.agent.post(`/api/matches/${id}/messages`).send({ body: 'eres imbécil' }).expect(422);
    assert.equal(insult.body.code, 'confirm_offensive');
  });

  it('a quien no tiene el Modo +18, el contenido sexual le llega oculto (con aviso previo)', async () => {
    const { a, b, id } = await pair('bilbao', { adultA: true, adultB: false });
    assert.equal((await a.agent.get(`/api/matches/${id}`)).body.adultPair, false);
    const first = await a.agent.post(`/api/matches/${id}/messages`).send({ body: 'Tengo ganas de follarte' }).expect(422);
    assert.equal(first.body.code, 'confirm_sexual');
    assert.match(first.body.error, /oculto/);
    const sent = await a.agent
      .post(`/api/matches/${id}/messages`)
      .send({ body: 'Tengo ganas de follarte', confirmed: true })
      .expect(201);
    assert.equal(sent.body.message.flag, 'sexual');
    const report = await b.agent.post(`/api/users/${a.id}/report`).send({ reason: 'sexual_no_deseado' });
    assert.equal(report.status, 200);
  });
});

describe('Modo +18: Autocitas íntimas', () => {
  const answers = (values) =>
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v, importance: 'importa' }]));
  const BASE = {
    finde: ['naturaleza'], musica: ['rock'], comida: ['todo'], viajes: 'mucho', mascotas: 'encantan',
    deporte: 'aveces', social: 'social', orden: 'normal', politica: 'centro', fumar: 'no',
  };

  it('dominante + sumiso/a y quien toma la iniciativa + a quien le gusta que le busquen, encajan', () => {
    assert.equal(questionSimilarity(q('rol'), 'domino', 'sumiso'), 1);
    assert.ok(questionSimilarity(q('rol'), 'domino', 'domino') < 0.5);
    assert.equal(questionSimilarity(q('iniciativa'), 'tomo', 'recibo'), 1);
    assert.ok(questionSimilarity(q('iniciativa'), 'recibo', 'recibo') < 0.5);
  });

  it('las preguntas íntimas solo cuentan si las dos personas tienen el Modo +18', () => {
    const a = answers({ ...BASE, libido: 'muy_alta', rol: 'domino', iniciativa: 'tomo', explorar: 'aventurero' });
    const b = answers({ ...BASE, libido: 'baja', rol: 'domino', iniciativa: 'tomo', explorar: 'clasico' });
    const plain = { intention: 'casual' };
    const hot = { intention: 'casual', adultMode: true };
    const without = deepScore(a, b, plain, hot);
    const withBoth = deepScore(a, b, hot, hot);
    assert.equal(without.sims.libido, undefined);
    assert.ok(withBoth.sims.libido != null);
    assert.ok(withBoth.score < without.score, 'la falta de química íntima baja la afinidad');
  });

  it('el motivo "química en lo íntimo" es genérico y solo aparece entre personas +18', () => {
    const a = answers({ ...BASE, libido: 'alta', rol: 'domino', iniciativa: 'tomo', explorar: 'aventurero' });
    const b = answers({ ...BASE, libido: 'alta', rol: 'sumiso', iniciativa: 'recibo', explorar: 'aventurero' });
    const hot = { intention: 'casual', adultMode: true };
    const r = deepScore(a, b, hot, hot);
    const reasons = reasonsFor(a, b, r.sims);
    assert.ok(reasons.includes('Tenéis química en lo íntimo 🔥'));
    for (const text of reasons) assert.doesNotMatch(text, /domin|sumis|libido|diario/i);
    const plainReasons = reasonsFor(a, b, deepScore(a, b, { intention: 'casual' }, hot).sims);
    assert.ok(!plainReasons.includes('Tenéis química en lo íntimo 🔥'));
  });
});

describe('Modo +18 en modo demo', () => {
  let t;
  before(() => (t = setup({ demoMode: true, demoRandom: () => 0, demoReplyDelayMs: [0, 0] })));
  after(() => t.cleanup());

  it('los perfiles demo +18 tienen lado picante y coquetean en el chat', async () => {
    const u = await t.user({ ...man, location: { city: 'madrid' } });
    await u.agent.put('/api/me/adult').send(ADULT).expect(200);
    await u.agent.put('/api/me/preferences').send({ onlyAdult: true }).expect(200);
    const target = (await u.agent.get('/api/discover')).body.profiles[0];
    assert.ok(target.adult, 've su lado picante');
    const { match } = (await u.agent.post('/api/swipes').send({ targetId: target.id, action: 'like' })).body;
    for (const body of ['Hola 😏', '¿Sexo en la primera cita?']) {
      await u.agent.post(`/api/matches/${match.id}/messages`).send({ body }).expect(201);
      await wait(600); // el perfil demo "empieza a escribir" a los 400 ms
    }
    const replies = (await u.agent.get(`/api/matches/${match.id}/messages`)).body.messages.filter(
      (m) => m.senderId === target.id && m.kind === 'text',
    );
    assert.ok(replies.length >= 2);
    assert.match(replies.at(-1).body, /😏|🔥|😉|🙈|apetece/);
  });
});
