import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';

export const PASSWORD = 'contraseña-segura';

export const BASE_PROFILE = {
  name: 'Test',
  birthdate: '1995-06-15',
  gender: 'hombre',
  showMe: ['mujer'],
  intention: 'serio',
  bio: 'Hola',
  job: '',
  interests: ['cafe', 'viajar', 'cine'],
  prompts: [{ id: 'domingo', answer: 'Brunch y paseo' }],
  location: { city: 'madrid' },
};

export function setup(overrides = {}) {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparka-test-'));
  const ctx = createApp({ dbFile: ':memory:', uploadDir, demoMode: false, authRateLimit: 10_000, ...overrides });
  let n = 0;

  /** Crea una cuenta con sesión iniciada. `profile: null` deja el perfil sin completar. */
  async function user(profile = {}) {
    n += 1;
    const agent = request.agent(ctx.app);
    const email = `user${n}@test.dev`;
    await agent.post('/api/auth/register').send({ email, password: PASSWORD }).expect(201);
    if (profile !== null) {
      await agent
        .put('/api/me/profile')
        .send({ ...BASE_PROFILE, name: `User${n}`, ...profile })
        .expect(200);
    }
    const me = (await agent.get('/api/me').expect(200)).body;
    return { agent, id: me.id, email };
  }

  function cleanup() {
    ctx.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }

  return { ...ctx, uploadDir, user, cleanup, request: () => request(ctx.app) };
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
