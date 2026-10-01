import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io as connect } from 'socket.io-client';
import { PASSWORD, setup, wait } from './helpers.js';

const man = { gender: 'hombre', showMe: ['mujer'] };
const woman = { gender: 'mujer', showMe: ['hombre'] };

describe('autenticación', () => {
  let t;
  before(() => (t = setup()));
  after(() => t.cleanup());

  it('registra, mantiene la sesión y cierra sesión', async () => {
    const { agent, email } = await t.user(null);
    const me = await agent.get('/api/me').expect(200);
    assert.equal(me.body.email, email);
    assert.equal(me.body.profile.completed, false);
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/me').expect(401);
  });

  it('rechaza emails duplicados (sin distinguir mayúsculas) y contraseñas cortas', async () => {
    const { email } = await t.user(null);
    const dup = await t.request().post('/api/auth/register').send({ email: email.toUpperCase(), password: PASSWORD });
    assert.equal(dup.status, 409);
    const short = await t.request().post('/api/auth/register').send({ email: 'x@y.dev', password: '123' });
    assert.equal(short.status, 400);
    assert.match(short.body.error, /8 caracteres/);
  });

  it('inicia sesión solo con la contraseña correcta', async () => {
    const { email } = await t.user(null);
    await t.request().post('/api/auth/login').send({ email, password: 'incorrecta1' }).expect(401);
    await t.request().post('/api/auth/login').send({ email: 'nadie@test.dev', password: PASSWORD }).expect(401);
    const ok = await t.request().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    const cookie = ok.headers['set-cookie'][0];
    assert.match(cookie, /sparka_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
  });

  it('protege las rutas privadas', async () => {
    await t.request().get('/api/me').expect(401);
    await t.request().get('/api/discover').expect(401);
  });
});

describe('perfil', () => {
  let t;
  before(() => (t = setup()));
  after(() => t.cleanup());

  it('no admite menores de 18 años', async () => {
    const { agent } = await t.user(null);
    const year = new Date().getUTCFullYear() - 17;
    const res = await agent.put('/api/me/profile').send({ birthdate: `${year}-01-01` }).expect(400);
    assert.match(res.body.error, /mayores de 18/);
  });

  it('pide perfil completo para descubrir y lo marca como completo al rellenarlo', async () => {
    const { agent } = await t.user(null);
    await agent.get('/api/discover').expect(403);
    await agent.put('/api/me/profile').send({ name: 'Ana', interests: ['cafe', 'cine'] }).expect(400);
    const res = await agent
      .put('/api/me/profile')
      .send({
        name: 'Ana',
        birthdate: '1996-02-29',
        gender: 'mujer',
        showMe: ['hombre'],
        intention: 'sin_prisa',
        interests: ['cafe', 'cine', 'yoga'],
        prompts: [{ id: 'reir', answer: 'Los memes' }],
        location: { lat: 41.39, lng: 2.17 },
      })
      .expect(200);
    assert.equal(res.body.profile.completed, true);
    assert.equal(res.body.profile.city, 'Barcelona');
    await agent.get('/api/discover').expect(200);
  });

  it('valida preferencias', async () => {
    const { agent } = await t.user();
    await agent.put('/api/me/preferences').send({ ageMin: 40, ageMax: 30 }).expect(400);
    const res = await agent.put('/api/me/preferences').send({ ageMin: 25, ageMax: 35, maxDistanceKm: 10 }).expect(200);
    assert.deepEqual(res.body.preferences, { ageMin: 25, ageMax: 35, maxDistanceKm: 10, intentions: [], incognito: false });
  });

  it('nunca expone email, fecha de nacimiento ni coordenadas a otras personas', async () => {
    const a = await t.user(man);
    await t.user(woman);
    const { body } = await a.agent.get('/api/discover').expect(200);
    assert.ok(body.profiles.length > 0);
    for (const p of body.profiles) {
      for (const key of ['email', 'birthdate', 'lat', 'lng']) assert.equal(p[key], undefined, key);
    }
  });
});

describe('descubrir, likes y matches', () => {
  let t;
  before(() => (t = setup()));
  after(() => t.cleanup());

  it('solo muestra perfiles mutuamente compatibles y cercanos', async () => {
    const a = await t.user(man);
    const b = await t.user(woman);
    const c = await t.user({ gender: 'mujer', showMe: ['mujer'] });
    const d = await t.user({ ...woman, location: { city: 'barcelona' } });
    const e = await t.user({ ...woman, birthdate: '1960-01-01' });
    await a.agent.put('/api/me/preferences').send({ ageMax: 50 }).expect(200);

    const ids = (await a.agent.get('/api/discover').expect(200)).body.profiles.map((p) => p.id);
    assert.ok(ids.includes(b.id));
    assert.ok(!ids.includes(c.id), 'C no busca hombres');
    assert.ok(!ids.includes(d.id), 'D está a más de 50 km');
    assert.ok(!ids.includes(e.id), 'E está fuera del rango de edad');
    assert.ok(!ids.includes(a.id), 'no te ves a ti');

    // Tampoco se puede dar like por la puerta de atrás a quien no te vería.
    await a.agent.post('/api/swipes').send({ targetId: c.id, action: 'like' }).expect(404);
  });

  it('filtra por intención si se pide', async () => {
    const a = await t.user({ ...man, location: { city: 'sevilla' } });
    const serious = await t.user({ ...woman, intention: 'serio', location: { city: 'sevilla' } });
    const casual = await t.user({ ...woman, intention: 'casual', location: { city: 'sevilla' } });
    await a.agent.put('/api/me/preferences').send({ intentions: ['casual'] }).expect(200);
    const ids = (await a.agent.get('/api/discover')).body.profiles.map((p) => p.id);
    assert.deepEqual(ids, [casual.id]);
    assert.ok(!ids.includes(serious.id));
  });

  it('hace match cuando el like es mutuo y abre el chat con el mensaje del like', async () => {
    const a = await t.user({ ...man, location: { city: 'bilbao' } });
    const b = await t.user({ ...woman, location: { city: 'bilbao' } });

    const first = await a.agent
      .post('/api/swipes')
      .send({ targetId: b.id, action: 'like', message: 'Me encantó tu plan de domingo' })
      .expect(200);
    assert.equal(first.body.matched, false);

    const likes = (await b.agent.get('/api/likes').expect(200)).body.likes;
    assert.equal(likes.length, 1);
    assert.equal(likes[0].profile.id, a.id);
    assert.equal(likes[0].message, 'Me encantó tu plan de domingo');
    assert.equal((await b.agent.get('/api/me/counts')).body.likes, 1);

    const second = await b.agent.post('/api/swipes').send({ targetId: a.id, action: 'like' }).expect(200);
    assert.equal(second.body.matched, true);
    assert.equal(second.body.match.user.id, a.id);

    await a.agent.post('/api/swipes').send({ targetId: b.id, action: 'like' }).expect(409);
    assert.equal((await b.agent.get('/api/likes')).body.likes.length, 0);

    const matchesA = (await a.agent.get('/api/matches').expect(200)).body.matches;
    assert.equal(matchesA.length, 1);
    assert.equal(matchesA[0].user.id, b.id);
    assert.equal(matchesA[0].lastMessage.body, 'Me encantó tu plan de domingo');
    assert.equal((await b.agent.get('/api/me/counts')).body.unread, 1);
  });

  it('chat: envío, lectura, privacidad y moderación', async () => {
    const a = await t.user({ ...man, location: { city: 'zaragoza' } });
    const b = await t.user({ ...woman, location: { city: 'zaragoza' } });
    const outsider = await t.user({ ...man, location: { city: 'zaragoza' } });
    await a.agent.post('/api/swipes').send({ targetId: b.id, action: 'like' });
    const { match } = (await b.agent.post('/api/swipes').send({ targetId: a.id, action: 'like' })).body;

    await a.agent.post(`/api/matches/${match.id}/messages`).send({ body: '¡Hola! ¿Qué tal?' }).expect(201);
    await outsider.agent.get(`/api/matches/${match.id}/messages`).expect(404);
    await outsider.agent.post(`/api/matches/${match.id}/messages`).send({ body: 'hola' }).expect(404);
    await a.agent.post(`/api/matches/${match.id}/messages`).send({ body: '   ' }).expect(400);

    const offensive = await a.agent.post(`/api/matches/${match.id}/messages`).send({ body: 'eres una idiota' }).expect(422);
    assert.equal(offensive.body.code, 'confirm_offensive');
    const sent = await a.agent
      .post(`/api/matches/${match.id}/messages`)
      .send({ body: 'eres una idiota', confirmed: true })
      .expect(201);
    assert.equal(sent.body.message.flag, 'offensive');

    const scam = await b.agent
      .post(`/api/matches/${match.id}/messages`)
      .send({ body: '¿Me puedes hacer un Bizum? Es urgente' })
      .expect(201);
    assert.equal(scam.body.message.flag, 'scam');

    const msgs = (await b.agent.get(`/api/matches/${match.id}/messages`).expect(200)).body.messages;
    assert.deepEqual(
      msgs.map((m) => m.body),
      ['¡Hola! ¿Qué tal?', 'eres una idiota', '¿Me puedes hacer un Bizum? Es urgente'],
    );
    assert.equal((await b.agent.get('/api/me/counts')).body.unread, 2);
    await b.agent.post(`/api/matches/${match.id}/read`).expect(200);
    assert.equal((await b.agent.get('/api/me/counts')).body.unread, 0);
    const afterRead = (await a.agent.get(`/api/matches/${match.id}/messages`)).body.messages;
    assert.ok(afterRead.filter((m) => m.senderId === a.id).every((m) => m.readAt));
  });

  it('limita las Chispas (superlikes) a 3 al día', async () => {
    const a = await t.user({ ...man, location: { city: 'malaga' } });
    const targets = [];
    for (let i = 0; i < 4; i++) targets.push(await t.user({ ...woman, location: { city: 'malaga' } }));
    for (const target of targets.slice(0, 3)) {
      await a.agent.post('/api/swipes').send({ targetId: target.id, action: 'superlike' }).expect(200);
    }
    const res = await a.agent.post('/api/swipes').send({ targetId: targets[3].id, action: 'superlike' }).expect(429);
    assert.match(res.body.error, /Chispas/);
    const likes = (await targets[0].agent.get('/api/likes')).body.likes;
    assert.equal(likes[0].superlike, true);
    // Un like normal sigue siendo ilimitado.
    await a.agent.post('/api/swipes').send({ targetId: targets[3].id, action: 'like' }).expect(200);
  });

  it('permite deshacer el último swipe, salvo si ya hay match', async () => {
    const a = await t.user({ ...man, location: { city: 'valencia' } });
    const b = await t.user({ ...woman, location: { city: 'valencia' } });
    const c = await t.user({ ...woman, location: { city: 'valencia' } });

    await a.agent.post('/api/swipes').send({ targetId: b.id, action: 'pass' }).expect(200);
    let deck = (await a.agent.get('/api/discover')).body.profiles.map((p) => p.id);
    assert.ok(!deck.includes(b.id));
    const undo = await a.agent.post('/api/swipes/undo').expect(200);
    assert.equal(undo.body.profile.id, b.id);
    deck = (await a.agent.get('/api/discover')).body.profiles.map((p) => p.id);
    assert.ok(deck.includes(b.id));

    await c.agent.post('/api/swipes').send({ targetId: a.id, action: 'like' });
    const { match } = (await a.agent.post('/api/swipes').send({ targetId: c.id, action: 'like' }).expect(200)).body;
    await a.agent.post('/api/swipes/undo').expect(409);

    // Un match deshecho hace tiempo no se puede "resucitar" con deshacer.
    await a.agent.delete(`/api/matches/${match.id}`).expect(200);
    t.db.prepare('UPDATE swipes SET created_at = created_at - 3600000 WHERE swiper_id = ?').run(a.id);
    await a.agent.post('/api/swipes/undo').expect(404);
    deck = (await a.agent.get('/api/discover')).body.profiles.map((p) => p.id);
    assert.ok(!deck.includes(c.id));
  });

  it('modo incógnito: solo te ve quien ya te ha dado like', async () => {
    const a = await t.user({ ...man, location: { city: 'quito' } });
    const b = await t.user({ ...woman, location: { city: 'quito' } });
    await b.agent.put('/api/me/preferences').send({ incognito: true }).expect(200);
    let deck = (await a.agent.get('/api/discover')).body.profiles.map((p) => p.id);
    assert.ok(!deck.includes(b.id));
    await a.agent.post('/api/swipes').send({ targetId: b.id, action: 'like' }).expect(404);

    await b.agent.post('/api/swipes').send({ targetId: a.id, action: 'like' }).expect(200);
    deck = (await a.agent.get('/api/discover')).body.profiles.map((p) => p.id);
    assert.ok(deck.includes(b.id));
  });
});

describe('seguridad', () => {
  let t;
  before(() => (t = setup()));
  after(() => t.cleanup());

  async function matched(city) {
    const a = await t.user({ ...man, location: { city } });
    const b = await t.user({ ...woman, location: { city } });
    await a.agent.post('/api/swipes').send({ targetId: b.id, action: 'like' });
    const { match } = (await b.agent.post('/api/swipes').send({ targetId: a.id, action: 'like' })).body;
    return { a, b, match };
  }

  it('bloquear elimina el match y oculta a ambas personas', async () => {
    const { a, b, match } = await matched('lima');
    const c = await t.user({ ...woman, location: { city: 'lima' } });
    await a.agent.post(`/api/users/${b.id}/block`).expect(200);
    await b.agent.get(`/api/matches/${match.id}/messages`).expect(404);
    assert.equal((await a.agent.get('/api/matches')).body.matches.length, 0);
    assert.equal((await b.agent.get('/api/matches')).body.matches.length, 0);
    // C le da like a A; A bloquea a C antes de verlo: desaparece de "Le gustas" y de Descubrir.
    await c.agent.post('/api/swipes').send({ targetId: a.id, action: 'like' });
    await a.agent.post(`/api/users/${c.id}/block`).expect(200);
    assert.equal((await a.agent.get('/api/likes')).body.likes.length, 0);
    await c.agent.post('/api/swipes').send({ targetId: a.id, action: 'pass' }).expect(404);
  });

  it('denunciar guarda la denuncia y bloquea', async () => {
    const { a, b } = await matched('caracas');
    await a.agent.post(`/api/users/${b.id}/report`).send({ reason: 'nada' }).expect(400);
    await a.agent.post(`/api/users/${b.id}/report`).send({ reason: 'estafa', details: 'Pide dinero' }).expect(200);
    const report = t.db.prepare('SELECT * FROM reports WHERE reporter_id = ?').get(a.id);
    assert.equal(report.reported_id, b.id);
    assert.equal(report.reason, 'estafa');
    assert.equal((await a.agent.get('/api/matches')).body.matches.length, 0);
  });

  it('deshacer match lo borra para las dos personas', async () => {
    const { a, b, match } = await matched('montevideo');
    await b.agent.delete(`/api/matches/${match.id}`).expect(200);
    await a.agent.get(`/api/matches/${match.id}`).expect(404);
    const deck = (await a.agent.get('/api/discover')).body.profiles.map((p) => p.id);
    assert.ok(!deck.includes(b.id), 'no vuelve a aparecer');
  });

  it('borrar la cuenta exige contraseña', async () => {
    const { a, b } = await matched('santiago');
    await a.agent.delete('/api/me').send({ password: 'otra-cosa' }).expect(403);
    await a.agent.delete('/api/me').send({ password: PASSWORD }).expect(200);
    await a.agent.get('/api/me').expect(401);
    assert.equal((await b.agent.get('/api/matches')).body.matches.length, 0);
  });
});

describe('fotos', () => {
  let t;
  before(() => (t = setup()));
  after(() => t.cleanup());

  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  it('sube fotos reales y rechaza archivos disfrazados', async () => {
    const { agent } = await t.user();
    await agent
      .post('/api/me/photos')
      .attach('photo', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' })
      .expect(400);
    const first = await agent.post('/api/me/photos').attach('photo', PNG, 'a.png').expect(201);
    const second = await agent.post('/api/me/photos').attach('photo', PNG, 'b.png').expect(201);
    assert.equal(first.body.photos.length, 1);
    const [p1, p2] = second.body.photos;
    assert.match(p1.url, /^\/uploads\/[a-f0-9]{32}\.png$/);
    await agent.get(p1.url).expect(200).expect('Content-Type', 'image/png');

    const reordered = await agent.post(`/api/me/photos/${p2.id}/main`).expect(200);
    assert.equal(reordered.body.photos[0].id, p2.id);
    const removed = await agent.delete(`/api/me/photos/${p1.id}`).expect(200);
    assert.deepEqual(removed.body.photos.map((p) => p.id), [p2.id]);
    await agent.get(p1.url).expect(404);
  });
});

describe('modo demo', () => {
  let t;
  before(() => (t = setup({ demoMode: true, demoRandom: () => 0, demoReplyDelayMs: [0, 0] })));
  after(() => t.cleanup());

  it('crea perfiles demo, te dan likes y responden en el chat', async () => {
    const a = await t.user(man);
    const likes = (await a.agent.get('/api/likes')).body.likes;
    assert.ok(likes.length > 0);
    assert.ok(likes.every((l) => l.profile.isDemo));
    assert.ok(likes.some((l) => l.superlike && l.message));

    const deck = (await a.agent.get('/api/discover')).body.profiles;
    const target = deck.find((p) => !likes.some((l) => l.profile.id === p.id));
    const swipe = await a.agent.post('/api/swipes').send({ targetId: target.id, action: 'like' }).expect(200);
    assert.equal(swipe.body.matched, true);

    const matchId = swipe.body.match.id;
    await a.agent.post(`/api/matches/${matchId}/messages`).send({ body: '¡Hola!' }).expect(201);
    await wait(600);
    const msgs = (await a.agent.get(`/api/matches/${matchId}/messages`)).body.messages;
    assert.equal(msgs.length, 2);
    assert.equal(msgs[1].senderId, target.id);
    assert.ok(msgs[0].readAt, 'el perfil demo "lee" el mensaje antes de responder');
  });

  it('las cuentas demo no pueden iniciar sesión', async () => {
    const email = t.db.prepare('SELECT email FROM users WHERE id = (SELECT user_id FROM profiles WHERE is_demo = 1 LIMIT 1)').get().email;
    await t.request().post('/api/auth/login').send({ email, password: 'sparka-dummy-password' }).expect(401);
  });
});

describe('tiempo real', () => {
  let t;
  let port;
  before(async () => {
    t = setup();
    await new Promise((resolve) => t.server.listen(0, resolve));
    port = t.server.address().port;
  });
  after(() => t.cleanup());

  async function socketFor(email) {
    const login = await t.request().post('/api/auth/login').send({ email, password: PASSWORD });
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const socket = connect(`http://localhost:${port}`, { extraHeaders: { cookie }, transports: ['websocket'] });
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    return socket;
  }

  it('rechaza sockets sin sesión', async () => {
    const socket = connect(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
    const err = await new Promise((resolve) => socket.on('connect_error', resolve));
    assert.equal(err.message, 'unauthorized');
    socket.close();
  });

  it('avisa de nuevos matches, mensajes y "escribiendo…"', async () => {
    const a = await t.user(man);
    const b = await t.user(woman);
    const socketA = await socketFor(a.email);
    const socketB = await socketFor(b.email);
    const event = (socket, name) => new Promise((resolve) => socket.once(name, resolve));

    const liked = event(socketB, 'likes:changed');
    await a.agent.post('/api/swipes').send({ targetId: b.id, action: 'like' });
    await liked;

    const matchEvent = event(socketA, 'match:new');
    const { match } = (await b.agent.post('/api/swipes').send({ targetId: a.id, action: 'like' })).body;
    const m = await matchEvent;
    assert.equal(m.matchId, match.id);
    assert.equal(m.user.id, b.id);

    const typing = event(socketA, 'typing');
    socketB.emit('typing', { matchId: match.id });
    assert.deepEqual(await typing, { matchId: match.id, userId: b.id });

    const msgEvent = event(socketA, 'message:new');
    await b.agent.post(`/api/matches/${match.id}/messages`).send({ body: '¡Hola desde el socket!' });
    assert.equal((await msgEvent).body, '¡Hola desde el socket!');

    const readEvent = event(socketB, 'message:read');
    await a.agent.post(`/api/matches/${match.id}/read`);
    assert.equal((await readEvent).matchId, match.id);

    socketA.close();
    socketB.close();
  });
});
