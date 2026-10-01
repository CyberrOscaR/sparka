import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { COINCIDE_TIMEOUT_MS, slotLabel, sortSlots } from '../server/coincide.js';
import { setup, wait } from './helpers.js';

const man = { gender: 'hombre', showMe: ['mujer'] };
const woman = { gender: 'mujer', showMe: ['hombre'] };
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('Coincidir: cuadrar la cita en secreto', () => {
  let t;
  before(() => (t = setup()));
  after(() => t.cleanup());

  async function pair(city) {
    const a = await t.user({ ...man, location: { city } });
    const b = await t.user({ ...woman, location: { city } });
    await a.agent.post('/api/swipes').send({ targetId: b.id, action: 'like' });
    const { match } = (await b.agent.post('/api/swipes').send({ targetId: a.id, action: 'like' })).body;
    return { a, b, id: match.id };
  }
  const view = async (u, id) => (await u.agent.get(`/api/matches/${id}`).expect(200)).body;
  const messages = async (u, id) => (await u.agent.get(`/api/matches/${id}/messages`)).body.messages;

  it('ordena y describe los huecos', () => {
    assert.deepEqual(sortSlots(['2026-10-05:manana', '2026-10-04:noche', '2026-10-04:manana']), [
      '2026-10-04:manana',
      '2026-10-04:noche',
      '2026-10-05:manana',
    ]);
    assert.equal(slotLabel('2026-10-03:noche'), 'sábado, 3 de octubre por la noche');
  });

  it('solo revela cuándo coincidís, nunca la agenda de la otra persona', async () => {
    const { a, b, id } = await pair('madrid');
    assert.equal((await view(a, id)).coincide, null);
    const started = (await a.agent.post(`/api/matches/${id}/coincide`).expect(200)).body;
    assert.equal(started.coincide.mySlots, null);
    await b.agent.post(`/api/matches/${id}/coincide`).expect(409);

    const aSlots = [`${day(2)}:tarde`, `${day(1)}:noche`, `${day(3)}:manana`];
    const afterA = (await a.agent.put(`/api/matches/${id}/coincide`).send({ slots: aSlots }).expect(200)).body;
    assert.deepEqual(afterA.coincide.mySlots, [`${day(1)}:noche`, `${day(2)}:tarde`, `${day(3)}:manana`]);

    const bView = await view(b, id);
    assert.equal(bView.coincide.mySlots, null);
    for (const s of aSlots) assert.equal(JSON.stringify(bView).includes(s), false, 'B no ve los huecos de A');
    const list = (await b.agent.get('/api/matches')).body.matches;
    assert.equal(list.find((m) => m.id === id).coincidePending, true);

    await b.agent
      .put(`/api/matches/${id}/coincide`)
      .send({ slots: [`${day(3)}:manana`, `${day(2)}:tarde`, `${day(5)}:noche`] })
      .expect(200);

    const plan = (await messages(a, id)).at(-1);
    assert.equal(plan.kind, 'plan');
    assert.deepEqual(plan.data.slots, [`${day(2)}:tarde`, `${day(3)}:manana`], 'solo los comunes, en orden');
    assert.ok(plan.data.idea);
    assert.match(plan.body, /Coincidís/);
    assert.equal(JSON.stringify(plan).includes(`${day(1)}:noche`), false, 'lo no común no se revela');
    assert.equal((await view(a, id)).coincide, null, 'la búsqueda termina');
    assert.equal((await a.agent.get('/api/me/counts')).body.unread, 1, 'quien marcó antes recibe el aviso');
  });

  it('si no coincidís, lo dice sin culpar a nadie', async () => {
    const { a, b, id } = await pair('sevilla');
    await b.agent.post(`/api/matches/${id}/coincide`).expect(200);
    await a.agent.put(`/api/matches/${id}/coincide`).send({ slots: [`${day(1)}:manana`] }).expect(200);
    await b.agent.put(`/api/matches/${id}/coincide`).send({ slots: [`${day(1)}:noche`] }).expect(200);
    const last = (await messages(b, id)).at(-1);
    assert.equal(last.kind, 'system');
    assert.match(last.body, /no coincidís/);
  });

  it('valida los huecos, los permisos y la caducidad', async () => {
    const { a, b, id } = await pair('valencia');
    const outsider = await t.user({ ...man, location: { city: 'valencia' } });
    await a.agent.put(`/api/matches/${id}/coincide`).send({ slots: [] }).expect(409);
    await outsider.agent.post(`/api/matches/${id}/coincide`).expect(404);
    await a.agent.post(`/api/matches/${id}/coincide`).expect(200);
    await a.agent.put(`/api/matches/${id}/coincide`).send({ slots: ['mañana por la tarde'] }).expect(400);
    await a.agent.put(`/api/matches/${id}/coincide`).send({ slots: [`${day(30)}:tarde`] }).expect(400);
    await outsider.agent.put(`/api/matches/${id}/coincide`).send({ slots: [] }).expect(404);

    // Pasados 3 días sin que la otra persona marque, caduca y se puede empezar de nuevo.
    t.db.prepare('UPDATE matches SET coincide_started_at = ? WHERE id = ?').run(Date.now() - COINCIDE_TIMEOUT_MS - 1000, id);
    assert.equal((await view(b, id)).coincide, null);
    await b.agent.post(`/api/matches/${id}/coincide`).expect(200);
  });

  it('no se puede usar en una conversación cerrada', async () => {
    const { a, b, id } = await pair('bilbao');
    await a.agent.post(`/api/matches/${id}/pulse`).expect(200);
    await b.agent.post(`/api/matches/${id}/pulse/vote`).send({ answer: 'no' }).expect(200);
    await a.agent.post(`/api/matches/${id}/coincide`).expect(409);
  });
});

describe('Coincidir en modo demo', () => {
  let t;
  before(() => (t = setup({ demoMode: true, demoRandom: () => 0, demoReplyDelayMs: [0, 0] })));
  after(() => t.cleanup());

  it('los perfiles demo marcan sus huecos y aparece el plan', async () => {
    const u = await t.user({ ...man, location: { city: 'lima' } });
    const target = (await u.agent.get('/api/discover')).body.profiles[0];
    const { match } = (await u.agent.post('/api/swipes').send({ targetId: target.id, action: 'like' })).body;
    await u.agent.post(`/api/matches/${match.id}/coincide`).expect(200);
    await u.agent.put(`/api/matches/${match.id}/coincide`).send({ slots: [`${day(1)}:tarde`, `${day(2)}:noche`] });
    await wait(100);
    const last = (await u.agent.get(`/api/matches/${match.id}/messages`)).body.messages.at(-1);
    assert.equal(last.kind, 'plan');
    assert.deepEqual(last.data.slots, [`${day(1)}:tarde`, `${day(2)}:noche`]);
  });
});
