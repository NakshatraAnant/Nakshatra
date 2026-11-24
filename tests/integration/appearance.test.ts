import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('Theme studio', () => {
  it('saves only safe presets, returns them on the session, and keeps them in the data export', async () => {
    const me = await signup(t, 'Theme Picker', { birth: false });
    expect((await me.c.get('/api/v1/auth/me')).user.profile.appearance).toEqual({ accent: 'ember', textSize: 'standard', corners: 'soft', world: { backdrop: 'nebula', lighting: 'warm', celestial: 'none', decoration: 'none', particles: 'archetype' } });

    await me.c.patch('/api/v1/profile', { appearance: { accent: 'jade', textSize: 'large', corners: 'crisp' }, colorScheme: 'light' });
    const p = (await me.c.get('/api/v1/auth/me')).user.profile;
    expect(p).toMatchObject({ colorScheme: 'light', appearance: { accent: 'jade', textSize: 'large', corners: 'crisp' } });

    for (const appearance of [
      { accent: '#ff0000', textSize: 'large', corners: 'crisp' },
      { accent: 'jade', textSize: 'huge', corners: 'crisp' },
      { accent: 'jade', textSize: 'large', corners: 'crisp', css: 'body{display:none}' },
      { accent: 'jade' },
    ]) expect((await me.c.req('PATCH', '/api/v1/profile', { appearance })).status).toBe(400);
    expect((await me.c.get('/api/v1/auth/me')).user.profile.appearance.accent).toBe('jade');

    const exp = await me.c.post('/api/v1/privacy/export', {});
    expect(exp.data.profile.appearance).toEqual({ accent: 'jade', textSize: 'large', corners: 'crisp' });
  });
});
