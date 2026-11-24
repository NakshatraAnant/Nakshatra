import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '../../src/shared/avatar';
import { Client, makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('Avatar creator', () => {
  it('saves fixed parts only, serves the drawn picture while it is in use, and removal hides it', async () => {
    const me = await signup(t, 'Avatar Maker', { birth: false });
    expect(await me.c.get('/api/v1/profile/avatar-builder')).toEqual({ config: null, inUse: false });

    for (const bad of [{ ...DEFAULT_AVATAR, skin: '#000' }, { ...DEFAULT_AVATAR, extra: 'x' }, { skin: 's1' }]) {
      expect((await me.c.req('PUT', '/api/v1/profile/avatar-builder', bad)).status).toBe(400);
    }
    const { avatarUrl } = await me.c.put('/api/v1/profile/avatar-builder', { ...DEFAULT_AVATAR, hair: 'bun', accessory: 'roundGlasses' });
    expect(avatarUrl).toMatch(new RegExp(`^/api/v1/avatars/${me.userId}\\?v=`));
    expect((await me.c.get('/api/v1/auth/me')).user.profile.avatarUrl).toBe(avatarUrl);

    const img = await t.app.inject({ method: 'GET', url: avatarUrl });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toContain('image/svg+xml');
    expect(img.body).toMatch(/^<svg/);
    expect(img.body).not.toMatch(/script/i);
    expect((await new Client(t.app).req('GET', `/api/v1/avatars/${crypto.randomUUID()}`)).status).toBe(404);

    // A new version changes the URL; removing the picture stops serving it but keeps the build.
    const second = await me.c.put('/api/v1/profile/avatar-builder', { ...DEFAULT_AVATAR, hair: 'curly' });
    expect(second.avatarUrl).not.toBe(avatarUrl);
    await me.c.req('DELETE', '/api/v1/profile/avatar');
    expect((await t.app.inject({ method: 'GET', url: second.avatarUrl })).statusCode).toBe(404);
    expect(await me.c.get('/api/v1/profile/avatar-builder')).toMatchObject({ inUse: false, config: { hair: 'curly' } });
  });
});
