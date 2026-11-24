import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '../../src/server/db/schema';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const creative = { name: 'Coffee launch', headline: 'Fresh filter coffee, delivered', body: 'Small-batch beans.', ctaLabel: 'Order', destinationUrl: 'https://example.com/coffee' };

async function staff() {
  const writer = await signup(t, 'Ads Writer', { birth: false });
  const reviewer = await signup(t, 'Ads Reviewer', { birth: false });
  await makeAdmin(t, writer.userId);
  await t.ctx.db.insert(s.userRoles).values({ userId: reviewer.userId, role: 'moderator' });
  const { advertiser } = await writer.c.post('/api/v1/admin/ads/advertisers', { name: 'Bean Co', website: 'https://example.com', contactEmail: 'ads@example.com' }, 201);
  return { writer, reviewer, advertiser };
}

describe('Ads', () => {
  it('policy blocks sensitive creative and non-contextual targeting; four-eyes review; edits go back to review', async () => {
    const { writer, reviewer, advertiser } = await staff();
    const member = await signup(t, 'Ads Member', { birth: false });
    expect((await member.c.req('POST', '/api/v1/admin/ads/campaigns', { advertiserId: advertiser.id, ...creative, startsAt: inDays(-1), endsAt: inDays(10) })).status).toBe(403);
    expect((await writer.c.req('POST', '/api/v1/admin/ads/campaigns', { advertiserId: advertiser.id, ...creative, targeting: { topics: ['vedic'] }, startsAt: inDays(-1), endsAt: inDays(10) })).status).toBe(400);
    expect((await writer.c.req('POST', '/api/v1/admin/ads/campaigns', { advertiserId: advertiser.id, ...creative, targeting: { topics: [], archetypes: ['sage'] }, startsAt: inDays(-1), endsAt: inDays(10) })).status).toBe(400);

    const bad = (await writer.c.post('/api/v1/admin/ads/campaigns', { advertiserId: advertiser.id, ...creative, headline: 'Made for introverts', startsAt: inDays(-1), endsAt: inDays(10) }, 201)).campaign;
    expect((await writer.c.req('POST', `/api/v1/admin/ads/campaigns/${bad.id}/submit`)).status).toBe(400);

    const { campaign } = await writer.c.post('/api/v1/admin/ads/campaigns', { advertiserId: advertiser.id, ...creative, startsAt: inDays(-1), endsAt: inDays(10) }, 201);
    expect((await reviewer.c.req('POST', `/api/v1/admin/ads/campaigns/${campaign.id}/review`, { decision: 'approve' })).status).toBe(409); // not submitted
    await writer.c.post(`/api/v1/admin/ads/campaigns/${campaign.id}/submit`);
    expect((await writer.c.req('POST', `/api/v1/admin/ads/campaigns/${campaign.id}/review`, { decision: 'approve' })).status).toBe(403); // own campaign
    expect((await reviewer.c.req('POST', `/api/v1/admin/ads/campaigns/${campaign.id}/review`, { decision: 'reject' })).status).toBe(400); // needs a reason
    await reviewer.c.post(`/api/v1/admin/ads/campaigns/${campaign.id}/review`, { decision: 'approve' });
    expect((await member.c.get('/api/v1/ads/slot')).ad.headline).toBe(creative.headline);

    await writer.c.patch(`/api/v1/admin/ads/campaigns/${campaign.id}`, { headline: 'Even fresher coffee' });
    const [after] = await t.ctx.db.select().from(s.adCampaigns).where(eq(s.adCampaigns.id, campaign.id));
    expect(after.status).toBe('draft');
    expect((await member.c.get('/api/v1/ads/slot')).ad).toBeNull();
  });

  it('serving: disclosure, why-this-ad, contextual topics, daily cap, hide, clicks need a real showing, Plus members see none, pause stops it', async () => {
    const { writer, reviewer, advertiser } = await staff();
    const member = await signup(t, 'Ads Viewer', { birth: false });
    const mk = async (extra: Record<string, unknown>) => {
      const { campaign } = await writer.c.post('/api/v1/admin/ads/campaigns', { advertiserId: advertiser.id, ...creative, startsAt: inDays(-1), endsAt: inDays(5), ...extra }, 201);
      await writer.c.post(`/api/v1/admin/ads/campaigns/${campaign.id}/submit`);
      await reviewer.c.post(`/api/v1/admin/ads/campaigns/${campaign.id}/review`, { decision: 'approve' });
      return campaign.id as string;
    };
    // Other tests' campaigns may be live; end them so this test controls what's eligible.
    await t.ctx.db.update(s.adCampaigns).set({ status: 'ended' });
    const food = await mk({ name: 'Food only', targeting: { topics: ['food'], languages: [] }, frequencyCapPerDay: 2 });

    expect((await member.c.get('/api/v1/ads/slot')).ad).toBeNull(); // not browsing food
    const first = (await member.c.get('/api/v1/ads/slot?topic=food')).ad;
    expect(first).toMatchObject({ id: food, disclosure: 'Sponsored · Bean Co' });
    expect(first.why).toMatch(/browsing “food”.*never based on your profile/);
    expect((await member.c.get('/api/v1/ads/slot?topic=food')).ad.id).toBe(food);
    expect((await member.c.get('/api/v1/ads/slot?topic=food')).ad).toBeNull(); // cap of 2 a day reached

    expect((await member.c.post(`/api/v1/ads/${food}/click`, { token: 'forged-token-value' })).counted).toBe(false);
    expect((await member.c.post(`/api/v1/ads/${food}/click`, { token: first.token })).counted).toBe(true);
    const [row] = await t.ctx.db.select().from(s.adDelivery).where(eq(s.adDelivery.campaignId, food));
    expect(row).toMatchObject({ impressions: 2, clicks: 1 });
    expect(row.viewerKey).not.toContain(member.userId); // pseudonymous key, not the member id

    const everyone = await mk({ name: 'Run of site' });
    expect((await member.c.get('/api/v1/ads/slot')).ad.id).toBe(everyone);
    await member.c.post(`/api/v1/ads/${everyone}/hide`, { reason: 'seen_too_often' });
    expect((await member.c.get('/api/v1/ads/slot')).ad).toBeNull();

    const other = await signup(t, 'Ads Plus', { birth: false });
    await t.ctx.db.insert(s.entitlements).values({ userId: other.userId, kind: 'subscription', refId: 'plus_monthly', sourceType: 'test', sourceId: other.userId, expiresAt: new Date(Date.now() + 864e5) });
    expect(await other.c.get('/api/v1/ads/slot')).toMatchObject({ ad: null, reason: 'plus' });

    const third = await signup(t, 'Ads Third', { birth: false });
    expect((await third.c.get('/api/v1/ads/slot')).ad.id).toBe(everyone);
    await reviewer.c.post(`/api/v1/admin/ads/campaigns/${everyone}/status`, { status: 'paused' });
    expect((await third.c.get('/api/v1/ads/slot')).ad).toBeNull();
    expect((await reviewer.c.req('POST', `/api/v1/admin/ads/campaigns/${food}/status`, { status: 'approved' })).status).toBe(409); // resume only from paused

    const report = await reviewer.c.get('/api/v1/admin/ads');
    expect(report.campaigns.find((c: { id: string }) => c.id === food)).toMatchObject({ impressions: 2, clicks: 1, reach: 1 });
    expect(report.campaigns.find((c: { id: string }) => c.id === everyone)).toMatchObject({ hides: 1 });
  });
});
