/* Audit probe: runs against an in-memory PGlite database via the project's own test harness. Read-only w.r.t. the repo. */
import { makeApp, signup, Client } from 'C:/Users/anant/Desktop/Nakshatra/tests/integration/harness';
import { totp } from 'C:/Users/anant/Desktop/Nakshatra/src/server/lib/crypto';
import { QUESTIONS, scorePersonality, PERSONA_ARCHETYPES } from 'C:/Users/anant/Desktop/Nakshatra/src/shared/personality';

const out: Record<string, unknown> = {};
const answers = (v = 4) => Object.fromEntries(QUESTIONS.map((q, i) => [q.id, ((i + v) % 5) + 1]));

async function main() {
  const t = await makeApp();
  const m = (n: string) => signup(t, n, { birth: false });
  const circleWith = async (owner: Awaited<ReturnType<typeof m>>, others: Awaited<ReturnType<typeof m>>[]) => {
    const { circle } = await owner.c.post('/api/v1/circles', { name: `Circle ${Math.random().toString(36).slice(2, 6)}` });
    const { token } = await owner.c.post(`/api/v1/circles/${circle.id}/invites`);
    for (const o of others) await o.c.post(`/api/v1/circle-invites/${token}/accept`);
    return circle.id as string;
  };

  // P1: pseudonymous author de-anonymised through mute list
  const A = await m('Aarav Realname'); const B = await m('Bina'); const C = await m('Chirag');
  await A.c.patch('/api/v1/identity/me', { pseudonym: 'Night Kite' });
  const cid = await circleWith(A, [B, C]);
  const { post } = await A.c.post('/api/v1/posts', { kind: 'confession', body: 'I secretly hate group trips.', visibility: 'group', groupId: cid, pseudonymous: true });
  const view = await B.c.get(`/api/v1/posts/${post.id}`);
  out.p1_postAuthorAsSeenByB = view.post.author;
  await B.c.post(`/api/v1/posts/${post.id}/mute-author`);
  const blocks = await B.c.get('/api/v1/blocks');
  out.p1_mutedListAfterMutingPseudonymousAuthor = blocks.muted;
  out.p1_DEANONYMISED = blocks.muted.some((x: { userId: string }) => x.userId === A.userId);

  // P2: author replying on own pseudonymous post reveals identity
  await A.c.post(`/api/v1/posts/${post.id}/comments`, { body: 'Okay maybe not all trips.' });
  const view2 = await C.c.get(`/api/v1/posts/${post.id}`);
  out.p2_commentAuthors = view2.comments.map((c: { author: unknown }) => c.author);
  out.p2_DEANONYMISED = view2.comments.some((c: { author: { userId?: string } }) => c.author.userId === A.userId);

  // P3: Who Said It / Hot Take Arena — author id leaks via round.excludeId
  for (const game of ['who_said_it', 'hot_take_arena']) {
    const { session } = await A.c.post('/api/v1/play/sessions', { gameKey: game, circleId: cid });
    await B.c.post(`/api/v1/play/sessions/${session.id}/join`, {});
    await C.c.post(`/api/v1/play/sessions/${session.id}/join`, {});
    await A.c.post(`/api/v1/play/sessions/${session.id}/start`);
    const lines: Record<string, string> = { [A.userId]: `alpha line ${game}`, [B.userId]: `bravo line ${game}`, [C.userId]: `charlie line ${game}` };
    for (const u of [A, B, C]) await u.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { text: lines[u.userId] } });
    const s = await C.c.get(`/api/v1/play/sessions/${session.id}`);
    const writer = Object.entries(lines).find(([, l]) => l === s.round.prompt)?.[0];
    out[`p3_${game}_round`] = { prompt: s.round.prompt, excludeId: s.round.excludeId, actualAuthor: writer, LEAKS_AUTHOR: s.round.excludeId === writer, waitingOn: s.players.map((p: { name: string; waitingOn: boolean }) => `${p.name}:${p.waitingOn}`) };
  }

  // P4: private-circle event visible to outsiders
  const O = await m('Outsider');
  const start = new Date(Date.now() + 86400000).toISOString(); const end = new Date(Date.now() + 90000000).toISOString();
  await A.c.post('/api/v1/events', { title: 'Secret circle dinner', description: 'At my flat', startsAt: start, endsAt: end, mode: 'in_person', location: '12 Private Lane', groupId: cid });
  const ev = await O.c.get('/api/v1/events');
  const leaked = ev.events.find((e: { title: string }) => e.title === 'Secret circle dinner');
  out.p4_outsiderSeesPrivateCircleEvent = leaked ? { title: leaked.title, location: leaked.location, groupId: leaked.groupId } : null;
  if (leaked) out.p4_outsiderCanRsvp = (await O.c.req('POST', `/api/v1/events/${leaked.id}/rsvp`, { status: 'going' })).status;

  // P5: MFA can be switched off via /mfa/setup without password
  const M = await m('Mfa User');
  const setup = await M.c.post('/api/v1/auth/mfa/setup');
  await M.c.post('/api/v1/auth/mfa/enable', { code: totp(setup.secret) });
  out.p5_mfaEnabledBefore = (await M.c.get('/api/v1/auth/me')).user.mfaEnabled;
  await M.c.post('/api/v1/auth/mfa/setup');
  out.p5_mfaEnabledAfterSetupCallNoPassword = (await M.c.get('/api/v1/auth/me')).user.mfaEnabled;

  // P6: signup account enumeration
  const anon = new Client(t.app);
  const dup = await anon.req('POST', '/api/v1/auth/signup', { email: A.email, password: 'another-long-pass', displayName: 'X', confirmAdult: true, acceptTerms: true });
  out.p6_duplicateSignup = { status: dup.status, message: (dup.body as { error?: { message?: string } }).error?.message };

  // P7: gifting the Expanded Identity Report
  const buyer = await m('Buyer'); await buyer.c.post('/api/v1/personality/assessment', { answers: answers() });
  const recipient = await m('Recipient'); // no assessment
  const prod = await buyer.c.get('/api/v1/products/report-identity-expanded');
  const variantId = prod.variants[0].id;
  await buyer.c.put('/api/v1/cart/items', { variantId, quantity: 1 });
  const co = await buyer.c.post('/api/v1/checkout', { gift: { recipientEmail: recipient.email, message: 'hi' }, idempotencyKey: 'gift-probe-0001' });
  const sim = await buyer.c.req('POST', `/api/v1/payments/dev/${co.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
  const ord = await buyer.c.get(`/api/v1/orders/${co.order.id}`);
  out.p7a_giftToMemberWithoutAssessment = { simulateStatus: sim.status, orderStatus: ord.order.status, paymentStatus: ord.payment?.status };
  // gift to an email with no account
  await buyer.c.put('/api/v1/cart/items', { variantId, quantity: 1 });
  const co2 = await buyer.c.post('/api/v1/checkout', { gift: { recipientEmail: 'nobody-yet@example.test', message: 'hi' }, idempotencyKey: 'gift-probe-0002' });
  const sim2 = await buyer.c.req('POST', `/api/v1/payments/dev/${co2.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
  const lib = await buyer.c.get('/api/v1/library');
  out.p7b_giftToNonMember = { simulateStatus: sim2.status, buyerLibraryReports: lib.reports.map((r: { templateKey: string }) => r.templateKey) };

  // P8: referral cap vs 30-day window ordering is code-only; skip.
  await t.close();

  // P9: archetype reachability & distribution over the full score lattice (each dimension 4 answers → 9 levels)
  const levels = [1, 2, 3, 4, 5];
  const dims = ['energy', 'compass', 'voice', 'tempo', 'horizon'];
  const qsBy = Object.fromEntries(dims.map((d) => [d, QUESTIONS.filter((q) => q.dimension === d)]));
  const counts = new Map<string, number>(); const conf = { high: 0, medium: 0, low: 0 };
  let total = 0;
  // sample uniformly random answer sheets (realistic respondents are not uniform; this is a reachability/bias probe)
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 200000; i++) {
    const a: Record<string, number> = {};
    for (const d of dims) for (const q of qsBy[d]) a[q.id] = levels[Math.floor(rnd() * 5)];
    const r = scorePersonality(a);
    counts.set(r.archetype, (counts.get(r.archetype) ?? 0) + 1); conf[r.confidence]++; total++;
  }
  // all-neutral and straight-line answer sheets
  const all = (v: number) => Object.fromEntries(QUESTIONS.map((q) => [q.id, v]));
  out.p9_allNeutral = scorePersonality(all(3)).archetype + ' / ' + scorePersonality(all(3)).confidence;
  out.p9_allAgree5 = scorePersonality(all(5)).archetype + ' / ' + scorePersonality(all(5)).confidence;
  out.p9_allDisagree1 = scorePersonality(all(1)).archetype + ' / ' + scorePersonality(all(1)).confidence;
  out.p9_determinism = JSON.stringify(scorePersonality(answers())) === JSON.stringify(scorePersonality(answers()));
  out.p9_uniformRandomDistributionPct = Object.fromEntries(PERSONA_ARCHETYPES.map((p) => [p.key, Number((100 * (counts.get(p.key) ?? 0) / total).toFixed(2))]));
  out.p9_unreachedUnderUniform = PERSONA_ARCHETYPES.filter((p) => !counts.get(p.key)).map((p) => p.key);
  out.p9_confidencePct = Object.fromEntries(Object.entries(conf).map(([k, v]) => [k, Number((100 * v / total).toFixed(1))]));
  // exhaustive reachability on the per-dimension score lattice using 4-answer dims
  const dimLevels = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  const reach = new Map<string, number>(); let n = 0;
  const rec = (i: number, v: number[]) => {
    if (i === 5) {
      const d = PERSONA_ARCHETYPES.map((p, k) => ({ key: p.key, k, dist: Math.round(Math.sqrt(dims.reduce((s, dd, j) => s + (v[j] - (p.prototype as Record<string, number>)[dd]) ** 2, 0)) * 1000) / 1000 })).sort((x, y) => x.dist - y.dist || x.k - y.k);
      reach.set(d[0].key, (reach.get(d[0].key) ?? 0) + 1); n++; return;
    }
    for (const l of dimLevels) rec(i + 1, [...v, l]);
  };
  rec(0, []);
  out.p9_latticeSharePct = Object.fromEntries(PERSONA_ARCHETYPES.map((p) => [p.key, Number((100 * (reach.get(p.key) ?? 0) / n).toFixed(2))]));
  out.p9_latticeUnreachable = PERSONA_ARCHETYPES.filter((p) => !reach.get(p.key)).map((p) => p.key);
  console.log(JSON.stringify(out, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
