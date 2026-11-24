import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '../../src/server/db/schema';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const creative = { name: 'Snack quiz', headline: 'Monsoon snack quiz', body: '', ctaLabel: 'Visit', destinationUrl: 'https://example.com/snacks', startsAt: inDays(-1), endsAt: inDays(10) };
const trivia = { kind: 'trivia', title: 'Monsoon snacks', description: 'Two quick ones.', outcomes: [], questions: [
  { text: 'Which pairs best with chai?', options: [{ text: 'Pakoras', correct: true }, { text: 'Ice cream', correct: false }] },
  { text: 'Vada pav is from…', options: [{ text: 'Kochi', correct: false }, { text: 'Mumbai', correct: true }] },
] };

async function staff() {
  const writer = await signup(t, 'Sponsor Writer', { birth: false });
  const reviewer = await signup(t, 'Sponsor Reviewer', { birth: false });
  await makeAdmin(t, writer.userId);
  await t.ctx.db.insert(s.userRoles).values({ userId: reviewer.userId, role: 'moderator' });
  const { advertiser } = await writer.c.post('/api/v1/admin/ads/advertisers', { name: 'Chai Co', website: 'https://example.com', contactEmail: 'ads@example.com' }, 201);
  const launch = async (body: Record<string, unknown>) => {
    const { campaign } = await writer.c.post('/api/v1/admin/ads/campaigns', { advertiserId: advertiser.id, ...creative, ...body }, 201);
    await writer.c.post(`/api/v1/admin/ads/campaigns/${campaign.id}/submit`);
    await reviewer.c.post(`/api/v1/admin/ads/campaigns/${campaign.id}/review`, { decision: 'approve' });
    return campaign.id as string;
  };
  return { writer, reviewer, advertiser, launch };
}

describe('Sponsored quizzes and challenges', () => {
  it('trivia only, reviewed, disclosed, answers hidden until taken, once per member, no rewards, totals only for sponsors', async () => {
    const { writer, advertiser, launch } = await staff();
    const member = await signup(t, 'Sponsor Player', { birth: false });

    const outcome = (await writer.c.post('/api/v1/admin/ads/campaigns', { advertiserId: advertiser.id, ...creative, placement: 'quiz', content: { ...trivia, kind: 'outcome', outcomes: [{ title: 'A', description: '' }, { title: 'B', description: '' }] } }, 201)).campaign;
    expect((await writer.c.req('POST', `/api/v1/admin/ads/campaigns/${outcome.id}/submit`)).status).toBe(400);
    const empty = (await writer.c.post('/api/v1/admin/ads/campaigns', { advertiserId: advertiser.id, ...creative, placement: 'quiz' }, 201)).campaign;
    expect((await writer.c.req('POST', `/api/v1/admin/ads/campaigns/${empty.id}/submit`)).status).toBe(400);

    const quizId = await launch({ placement: 'quiz', content: trivia });
    expect((await member.c.get('/api/v1/ads/slot')).ad).toBeNull(); // quizzes never show as feed cards
    const list = await member.c.get('/api/v1/ads/sponsored?placement=quiz');
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ disclosure: 'Sponsored · Chai Co', myScore: null, total: 2 });
    expect(list.items[0].why).toMatch(/earns no rewards/);
    expect(JSON.stringify(list)).not.toContain('correct');

    const xpBefore = (await member.c.get('/api/v1/progress')).xp ?? null;
    expect((await member.c.req('POST', `/api/v1/ads/${quizId}/quiz`, { answers: [0] })).status).toBe(400);
    const r = await member.c.post(`/api/v1/ads/${quizId}/quiz`, { answers: [0, 0] });
    expect(r).toMatchObject({ score: 1, total: 2, answers: [0, 1] });
    expect((await member.c.req('POST', `/api/v1/ads/${quizId}/quiz`, { answers: [0, 1] })).status).toBe(409);
    expect((await member.c.get('/api/v1/ads/sponsored?placement=quiz')).items[0].myScore).toBe(1);
    expect((await member.c.get('/api/v1/progress')).xp ?? null).toEqual(xpBefore);

    // Stored pseudonymously; staff see totals.
    const rows = await t.ctx.db.select().from(s.adParticipation).where(eq(s.adParticipation.campaignId, quizId));
    expect(JSON.stringify(rows)).not.toContain(member.userId);
    const admin = (await writer.c.get('/api/v1/admin/ads')).campaigns.find((c: { id: string }) => c.id === quizId);
    expect(admin).toMatchObject({ quizTakes: 1, quizAverage: 1 });

    // Hiding removes it.
    await member.c.post(`/api/v1/ads/${quizId}/hide`, { reason: 'not_relevant' });
    expect((await member.c.get('/api/v1/ads/sponsored?placement=quiz')).items).toHaveLength(0);
    expect((await member.c.post('/api/v1/privacy/export', {})).data.sponsoredParticipation).toHaveLength(1);
  });

  it('challenges: join, finish, leave; Plus members see none; edits keep untouched fields', async () => {
    const { writer, launch } = await staff();
    const member = await signup(t, 'Challenge Member', { birth: false });
    const questId = await launch({ placement: 'quest', content: { title: 'Cook something new', description: 'This week only.', steps: ['Pick a recipe', 'Share a photo drop'] } });
    const item = async () => (await member.c.get('/api/v1/ads/sponsored?placement=quest')).items[0];
    expect(await item()).toMatchObject({ quest: { title: 'Cook something new' }, accepted: false, done: false });
    const plus = await signup(t, 'Challenge Plus', { birth: false });
    await t.ctx.db.insert(s.entitlements).values({ userId: plus.userId, kind: 'subscription', refId: 'plus_monthly', sourceType: 'test', sourceId: plus.userId, expiresAt: new Date(Date.now() + 864e5) });
    expect(await plus.c.get('/api/v1/ads/sponsored?placement=quest')).toMatchObject({ items: [], reason: 'plus' });
    await member.c.post(`/api/v1/ads/${questId}/quest`, { action: 'accept' });
    await member.c.post(`/api/v1/ads/${questId}/quest`, { action: 'done' });
    expect(await item()).toMatchObject({ accepted: true, done: true });
    expect((await writer.c.get('/api/v1/admin/ads')).campaigns.find((c: { id: string }) => c.id === questId)).toMatchObject({ questAccepted: 1, questDone: 1 });
    await member.c.post(`/api/v1/ads/${questId}/quest`, { action: 'leave' });
    expect(await item()).toMatchObject({ accepted: false, done: false });

    // Editing one field returns it to review without wiping the rest.
    await writer.c.patch(`/api/v1/admin/ads/campaigns/${questId}`, { name: 'Renamed' });
    const [after] = await t.ctx.db.select().from(s.adCampaigns).where(eq(s.adCampaigns.id, questId));
    expect(after).toMatchObject({ status: 'draft', ctaLabel: 'Visit', placement: 'quest' });
    expect((after.content as { steps: string[] }).steps).toHaveLength(2);
    expect((await member.c.get('/api/v1/ads/sponsored?placement=quest')).items).toHaveLength(0);
  });
});
