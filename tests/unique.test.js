import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { blindDay, nextResetAt, questionForDay } from '../server/blind.js';
import { BLIND_QUESTIONS } from '../server/blindQuestions.js';
import { PULSE_STALE_MS, PULSE_TIMEOUT_MS } from '../server/pulse.js';
import { setup, wait } from './helpers.js';

const man = { gender: 'hombre', showMe: ['mujer'] };
const woman = { gender: 'mujer', showMe: ['hombre'] };
const at = (city) => ({ location: { city } });

async function answer(u, body) {
  return (await u.agent.put('/api/blind/answer').send({ body }).expect(200)).body;
}

describe('A ciegas: la Pregunta del Día', () => {
  let t;
  before(() => (t = setup()));
  after(() => t.cleanup());

  it('la pregunta es la misma para todo el mundo y cambia cada día', () => {
    assert.equal(questionForDay('2026-10-01').id, questionForDay('2026-10-01').id);
    assert.notEqual(questionForDay('2026-10-01').id, questionForDay('2026-10-02').id);
    const ids = new Set(Array.from({ length: BLIND_QUESTIONS.length }, (_, i) => questionForDay(blindDay(Date.UTC(2026, 0, 1 + i))).id));
    assert.equal(ids.size, BLIND_QUESTIONS.length, 'recorre todas las preguntas');
    assert.equal(nextResetAt(Date.UTC(2026, 9, 1, 15, 30)), Date.UTC(2026, 9, 2));
    for (const q of BLIND_QUESTIONS) assert.ok(q.demo.length >= 6, q.id);
  });

  it('hay que responder para leer a los demás, y el feed es anónimo', async () => {
    const a = await t.user({ ...man, ...at('madrid') });
    const b = await t.user({ ...woman, ...at('madrid'), interests: ['cafe', 'viajar', 'yoga'] });

    let state = (await b.agent.get('/api/blind').expect(200)).body;
    assert.equal(state.feed, null);
    assert.equal(state.myAnswer, null);
    assert.ok(state.question.text.length > 5);

    await answer(a, 'Saber siempre cuál es la cola más rápida del súper.');
    state = (await b.agent.get('/api/blind')).body;
    assert.equal(state.nearbyCount, 1, 've cuánta gente ha respondido, pero no qué');
    assert.equal(state.feed, null);

    state = await answer(b, 'Hablar con las palomas.');
    assert.equal(state.myAnswer.body, 'Hablar con las palomas.');
    assert.equal(state.feed.length, 1);
    const item = state.feed[0];
    assert.equal(item.body, 'Saber siempre cuál es la cola más rápida del súper.');
    assert.deepEqual(Object.keys(item).sort(), ['age', 'body', 'distanceKm', 'id', 'intention', 'liked', 'sharedInterests']);
    assert.equal(item.sharedInterests, 2);
    assert.equal(JSON.stringify(state).includes(String(a.email)), false);
  });

  it('valida las respuestas y no publica contenido ofensivo', async () => {
    const u = await t.user({ ...man, ...at('bilbao') });
    await u.agent.put('/api/blind/answer').send({ body: 'ok' }).expect(400);
    const res = await u.agent.put('/api/blind/answer').send({ body: 'quien lea esto es idiota' }).expect(400);
    assert.match(res.body.error, /ofensiva/);
    await answer(u, 'Primera versión');
    const edited = await answer(u, 'Segunda versión');
    assert.equal(edited.myAnswer.body, 'Segunda versión');
  });

  it('match a ciegas: solo cuando a los dos os encanta la respuesta del otro', async () => {
    const a = await t.user({ ...man, ...at('valencia') });
    const b = await t.user({ ...woman, ...at('valencia') });
    const c = await t.user({ ...woman, ...at('valencia') });
    await answer(a, 'Tortilla de patatas, con cebolla.');
    const bState = await answer(b, 'Ramen. Es un abrazo en un bol.');
    const aAnswerId = bState.feed[0].id;

    // Sin responder no se pueden dar chispas.
    await c.agent.post(`/api/blind/answers/${aAnswerId}/like`).expect(403);

    const first = await b.agent.post(`/api/blind/answers/${aAnswerId}/like`).expect(200);
    assert.equal(first.body.matched, false);
    let aState = (await a.agent.get('/api/blind')).body;
    assert.equal(aState.myAnswer.likes, 1, 'A sabe que a alguien le gustó, no a quién');
    await a.agent.put('/api/blind/answer').send({ body: 'Cambio de opinión' }).expect(409);
    assert.equal((await b.agent.get('/api/blind')).body.feed[0].liked, true);

    const bAnswerId = aState.feed.find((f) => f.body.startsWith('Ramen')).id;
    const second = await a.agent.post(`/api/blind/answers/${bAnswerId}/like`).expect(200);
    assert.equal(second.body.matched, true);
    assert.equal(second.body.match.source, 'blind');
    assert.equal(second.body.match.user.id, b.id, 'ahora sí: se revela quién es');

    const msgs = (await a.agent.get(`/api/matches/${second.body.match.id}/messages`)).body.messages;
    assert.deepEqual(msgs.map((m) => m.kind), ['blind', 'blind']);
    assert.ok(msgs.every((m) => m.body.startsWith(questionForDay(blindDay()).text)));
    assert.ok(msgs.some((m) => m.senderId === a.id && m.body.endsWith('Tortilla de patatas, con cebolla.')));

    // Ya no se ven en el feed ni en Descubrir.
    aState = (await a.agent.get('/api/blind')).body;
    assert.ok(!aState.feed.some((f) => f.id === bAnswerId));
    const deck = (await a.agent.get('/api/discover')).body.profiles.map((p) => p.id);
    assert.ok(!deck.includes(b.id));
  });

  it('segunda oportunidad: aparece gente que descartaste por la foto, pero no quien no te vería', async () => {
    const a = await t.user({ ...man, ...at('sevilla') });
    const passed = await t.user({ ...woman, ...at('sevilla') });
    const notForA = await t.user({ gender: 'mujer', showMe: ['mujer'], ...at('sevilla') });
    const blocked = await t.user({ ...woman, ...at('sevilla') });
    await a.agent.post('/api/swipes').send({ targetId: passed.id, action: 'pass' }).expect(200);
    await a.agent.post(`/api/users/${blocked.id}/block`).expect(200);
    await answer(passed, 'Respuesta de quien descartaste');
    await answer(notForA, 'Respuesta de quien no busca hombres');
    await answer(blocked, 'Respuesta de alguien bloqueado');
    const feed = (await answer(a, 'Mi respuesta')).feed.map((f) => f.body);
    assert.deepEqual(feed, ['Respuesta de quien descartaste']);
  });

  it('se puede retirar una chispa', async () => {
    const a = await t.user({ ...man, ...at('malaga') });
    const b = await t.user({ ...woman, ...at('malaga') });
    await answer(a, 'Algo');
    const id = (await answer(b, 'Otra cosa')).feed[0].id;
    await b.agent.post(`/api/blind/answers/${id}/like`).expect(200);
    await b.agent.delete(`/api/blind/answers/${id}/like`).expect(200);
    assert.equal((await a.agent.get('/api/blind')).body.myAnswer.likes, 0);
  });
});

describe('El Pulso: adiós al ghosting', () => {
  let t;
  before(() => (t = setup()));
  after(() => t.cleanup());

  async function pair(city) {
    const a = await t.user({ ...man, ...at(city) });
    const b = await t.user({ ...woman, ...at(city) });
    await a.agent.post('/api/swipes').send({ targetId: b.id, action: 'like' });
    const { match } = (await b.agent.post('/api/swipes').send({ targetId: a.id, action: 'like' })).body;
    return { a, b, id: match.id };
  }
  const get = async (u, id) => (await u.agent.get(`/api/matches/${id}`).expect(200)).body;

  it('pulso mutuo: un "sí" es secreto hasta que es mutuo, y luego os propone un plan', async () => {
    const { a, b, id } = await pair('madrid');
    assert.equal((await get(a, id)).canStartPulse, true);
    const started = (await a.agent.post(`/api/matches/${id}/pulse`).expect(200)).body;
    assert.equal(started.pulse.myVote, null);
    assert.ok(started.pulse.expiresAt - started.pulse.startedAt === PULSE_TIMEOUT_MS);

    const afterA = (await a.agent.post(`/api/matches/${id}/pulse/vote`).send({ answer: 'yes' }).expect(200)).body;
    assert.equal(afterA.pulse.myVote, 'yes');
    const bView = await get(b, id);
    assert.equal(bView.pulse.myVote, null);
    assert.equal(JSON.stringify(bView).includes('"yes"'), false, 'B no puede saber que A dijo que sí');

    await a.agent.post(`/api/matches/${id}/pulse/vote`).send({ answer: 'yes' }).expect(409);
    const done = (await b.agent.post(`/api/matches/${id}/pulse/vote`).send({ answer: 'yes' }).expect(200)).body;
    assert.equal(done.pulse, null);
    assert.equal(done.closed, null);
    const msgs = (await a.agent.get(`/api/matches/${id}/messages`)).body.messages;
    assert.equal(msgs.at(-1).kind, 'system');
    assert.match(msgs.at(-1).body, /Pulso mutuo/);

    // No se puede repetir el Pulso enseguida.
    await a.agent.post(`/api/matches/${id}/pulse`).expect(429);
  });

  it('un "no" cierra la conversación con una despedida amable', async () => {
    const { a, b, id } = await pair('barcelona');
    await b.agent.post(`/api/matches/${id}/pulse`).expect(200);
    await a.agent.post(`/api/matches/${id}/pulse/vote`).send({ answer: 'maybe' }).expect(400);
    const res = (await a.agent.post(`/api/matches/${id}/pulse/vote`).send({ answer: 'no' }).expect(200)).body;
    assert.equal(res.closed.reason, 'pulse_no');

    const bView = await get(b, id);
    assert.equal(bView.closed.reason, 'pulse_no');
    const last = (await b.agent.get(`/api/matches/${id}/messages`)).body.messages.at(-1);
    assert.equal(last.kind, 'system');
    assert.match(last.body, /nadie desaparece/);
    assert.equal((await b.agent.get('/api/me/counts')).body.unread, 1, 'B recibe el aviso');

    await b.agent.post(`/api/matches/${id}/messages`).send({ body: '¿Hola?' }).expect(409);
    await b.agent.post(`/api/matches/${id}/pulse`).expect(409);
    const list = (await b.agent.get('/api/matches')).body.matches;
    assert.equal(list.find((m) => m.id === id).closed, true);
    // Se puede borrar del todo.
    await b.agent.delete(`/api/matches/${id}`).expect(200);
  });

  it('una conversación en silencio recibe un Pulso automático, y si nadie responde se cierra sola', async () => {
    const { a, b, id } = await pair('zaragoza');
    await a.agent.post(`/api/matches/${id}/messages`).send({ body: 'Hola' }).expect(201);
    let list = (await a.agent.get('/api/matches')).body.matches;
    assert.equal(list.find((m) => m.id === id).pulsePending, false);

    const old = Date.now() - PULSE_STALE_MS - 60_000;
    t.db.prepare('UPDATE messages SET created_at = ? WHERE match_id = ?').run(old, id);
    t.db.prepare('UPDATE matches SET created_at = ? WHERE id = ?').run(old, id);
    list = (await b.agent.get('/api/matches')).body.matches;
    assert.equal(list.find((m) => m.id === id).pulsePending, true);

    await a.agent.post(`/api/matches/${id}/pulse/vote`).send({ answer: 'yes' }).expect(200);
    t.db.prepare('UPDATE matches SET pulse_started_at = ? WHERE id = ?').run(Date.now() - PULSE_TIMEOUT_MS - 60_000, id);
    t.ctx.pulse.sweep();
    const view = await get(a, id);
    assert.equal(view.closed.reason, 'pulse_timeout');
    const last = (await a.agent.get(`/api/matches/${id}/messages`)).body.messages.at(-1);
    assert.match(last.body, /caducó/);
  });

  it('solo las personas del match pueden tomar o responder el Pulso', async () => {
    const { id } = await pair('lima');
    const outsider = await t.user({ ...man, ...at('lima') });
    await outsider.agent.post(`/api/matches/${id}/pulse`).expect(404);
    await outsider.agent.post(`/api/matches/${id}/pulse/vote`).send({ answer: 'yes' }).expect(404);
  });
});

describe('modo demo con las funciones únicas', () => {
  let t;
  before(
    () =>
      (t = setup({ demoMode: true, demoRandom: () => 0, demoReplyDelayMs: [0, 0], demoBlindLikeDelaysMs: [0, 0, 0] })),
  );
  after(() => t.cleanup());

  it('los perfiles demo responden, dan chispas a tu respuesta y puede haber match a ciegas', async () => {
    const u = await t.user({ ...man, ...at('madrid') });
    const before = (await u.agent.get('/api/blind')).body;
    assert.ok(before.nearbyCount > 0);
    const state = await answer(u, 'Calentar el café solo con mirarlo.');
    const bodies = state.feed.map((f) => f.body);
    assert.equal(new Set(bodies).size, bodies.length, 'sin respuestas repetidas en tu ciudad');

    await wait(150);
    assert.ok((await u.agent.get('/api/blind')).body.myAnswer.likes > 0);
    assert.equal((await u.agent.get('/api/me/counts')).body.blind.answered, true);

    for (const item of state.feed) {
      const res = await u.agent.post(`/api/blind/answers/${item.id}/like`);
      if (res.body.matched) break;
    }
    await wait(150);
    const matches = (await u.agent.get('/api/matches')).body.matches;
    assert.ok(matches.some((m) => m.source === 'blind'));
  });

  it('los perfiles demo responden al Pulso', async () => {
    const u = await t.user({ ...man, ...at('bogota') });
    const target = (await u.agent.get('/api/discover')).body.profiles[0];
    const { match } = (await u.agent.post('/api/swipes').send({ targetId: target.id, action: 'like' })).body;
    await u.agent.post(`/api/matches/${match.id}/pulse`).expect(200);
    await wait(100);
    await u.agent.post(`/api/matches/${match.id}/pulse/vote`).send({ answer: 'yes' }).expect(200);
    const last = (await u.agent.get(`/api/matches/${match.id}/messages`)).body.messages.at(-1);
    assert.match(last.body, /Pulso mutuo/);
  });
});
