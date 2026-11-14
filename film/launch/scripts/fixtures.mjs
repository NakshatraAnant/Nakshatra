/**
 * Dresses a LOCAL Nakshatra app for the shoot. Every record is created through the product's own public API —
 * sign-up, the real assessment, real Thought Drops, a real circle, a real tournament — so the footage shows the
 * application exactly as it behaves. Names and posts are sample content written for the film; nothing here is a
 * real member, and nothing is sent anywhere but the local app.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { APP, SHOOT, api, request, sleep } from './lib.mjs';

const run = Date.now().toString(36);
const CAST = [
  { key: 'lead', intents: ['friends', 'game_partners'], name: 'Aanya', sheet: [5, 2, 4, 1, 5, 3, 4, 2, 5, 1], avatar: { skin: 's4', face: 'oval', hair: 'waves', hairColor: 'black', eyes: 'round', brows: 'arched', mouth: 'smile', accessory: 'earrings', background: 'violet', outfit: 'gold', pose: 'wave' } },
  { key: 'kabir', intents: ['game_partners', 'deep_talks'], name: 'Kabir', sheet: [2, 5, 1, 4, 2, 5, 3, 5, 1, 4], avatar: { skin: 's5', face: 'long', hair: 'crop', hairColor: 'black', eyes: 'smile', brows: 'flat', mouth: 'grin', accessory: 'glasses', background: 'sky', outfit: 'ink', pose: 'hips' } },
  { key: 'meera', intents: ['deep_talks', 'circle_members'], name: 'Meera', sheet: [4, 4, 2, 5, 1, 2, 5, 3, 3, 5], avatar: { skin: 's3', face: 'round', hair: 'bun', hairColor: 'darkBrown', eyes: 'round', brows: 'arched', mouth: 'smile', accessory: 'roundGlasses', background: 'rose', outfit: 'jade', pose: 'think' } },
  { key: 'zoya', intents: ['creative', 'friends'], name: 'Zoya', sheet: [1, 3, 5, 2, 4, 1, 2, 5, 4, 3], avatar: { skin: 's2', face: 'oval', hair: 'long', hairColor: 'auburn', eyes: 'smile', brows: 'flat', mouth: 'open', accessory: 'freckles', background: 'gold', outfit: 'violet', pose: 'wave' } },
  { key: 'arjun', intents: ['game_partners'], name: 'Arjun', sheet: [3, 1, 5, 5, 2, 4, 1, 4, 2, 5], avatar: { skin: 's4', face: 'oval', hair: 'curly', hairColor: 'black', eyes: 'dot', brows: 'flat', mouth: 'smile', accessory: 'none', background: 'jade', outfit: 'ember', pose: 'idle' } },
  { key: 'tara', intents: ['friends', 'creative'], name: 'Tara', sheet: [5, 5, 1, 2, 4, 2, 5, 1, 3, 4], avatar: { skin: 's6', face: 'round', hair: 'headwrap', hairColor: 'violet', eyes: 'round', brows: 'arched', mouth: 'grin', accessory: 'earrings', background: 'ember', outfit: 'bone', pose: 'hips' } },
  { key: 'ishaan', intents: ['study_buddies', 'deep_talks'], name: 'Ishaan', sheet: [2, 2, 4, 5, 5, 1, 3, 4, 1, 5], avatar: { skin: 's3', face: 'long', hair: 'short', hairColor: 'brown', eyes: 'sleepy', brows: 'flat', mouth: 'neutral', accessory: 'none', background: 'ink', outfit: 'sky', pose: 'think' } },
  { key: 'noor', intents: ['circle_members', 'friends'], name: 'Noor', sheet: [4, 1, 3, 3, 5, 5, 2, 1, 5, 2], avatar: { skin: 's1', face: 'oval', hair: 'long', hairColor: 'blonde', eyes: 'smile', brows: 'arched', mouth: 'smile', accessory: 'none', background: 'sky', outfit: 'rose', pose: 'idle' } },
];

const DROPS = [
  { by: 'kabir', kind: 'thought', body: 'The best conversations start right after someone says “okay, I should really go.”' },
  { by: 'meera', kind: 'question', body: 'What is a small thing a friend did years ago that you still think about?' },
  { by: 'zoya', kind: 'dilemma', body: 'Tell your friend their idea won’t work — or let them find out on their own?' },
  { by: 'arjun', kind: 'thought', body: 'You can tell everything about a person by how they act when plans get cancelled.' },
  { by: 'tara', kind: 'poll', body: 'A perfect Sunday is…', pollOptions: ['Nowhere to be', 'A long drive', 'Everyone over for lunch'] },
  { by: 'lead', kind: 'thought', body: 'Being understood without having to explain yourself is the whole point.' },
];

const TRIVIA = {
  title: 'Friday Night Trivia',
  questions: [
    { text: 'Which planet has the shortest day?', options: [{ text: 'Jupiter', correct: true }, { text: 'Mars' }, { text: 'Venus' }, { text: 'Mercury' }] },
    { text: 'How many strings does a standard violin have?', options: [{ text: 'Six' }, { text: 'Four', correct: true }, { text: 'Five' }] },
    { text: 'Which ocean is the deepest?', options: [{ text: 'Atlantic' }, { text: 'Indian' }, { text: 'Pacific', correct: true }] },
    { text: 'What does a sommelier specialise in?', options: [{ text: 'Wine', correct: true }, { text: 'Perfume' }, { text: 'Cheese' }] },
    { text: 'Which is the only even prime number?', options: [{ text: 'Zero' }, { text: 'Two', correct: true }, { text: 'Four' }] },
  ],
  // What each cast member answers (index per question) — a spread of scores for the arena.
  plays: { kabir: [0, 1, 2, 0, 1], meera: [0, 1, 2, 1, 1], zoya: [0, 1, 0, 0, 1], arjun: [1, 1, 2, 0, 0], tara: [0, 0, 2, 0, 1], ishaan: [0, 1, 1, 2, 1], lead: [0, 1, 2, 0, 1] },
};

const step = (label) => process.stdout.write(`· ${label}\n`);
const people = {};

for (const c of CAST) {
  const ctx = await request.newContext();
  const email = `${c.key}.${run}@film.nakshatra.local`;
  const password = `film-${randomUUID()}`;
  await api(ctx, 'POST', 'auth/signup', { email, password, displayName: c.name, confirmAdult: true, acceptTerms: true });
  const box = await api(ctx, 'GET', `dev/mailbox?to=${encodeURIComponent(email)}`);
  const mail = box.emails.find((m) => /verify/i.test(m.subject)) ?? box.emails[0];
  await api(ctx, 'POST', 'auth/verify-email', { token: /token=([A-Za-z0-9_-]+)/.exec(mail.textBody)[1] });
  const { questions } = await api(ctx, 'GET', 'personality/questions');
  await api(ctx, 'POST', 'personality/assessment', { answers: Object.fromEntries(questions.map((q, i) => [q.id, c.sheet[i % c.sheet.length]])) });
  await api(ctx, 'PUT', 'profile/avatar-builder', c.avatar);
  await api(ctx, 'PATCH', 'profile', { visibility: 'public' });
  // Discover is opt-in in the product; the sample cast opts in the same way a member would.
  await api(ctx, 'PUT', 'people/settings', { discoverable: true, intents: c.intents });
  const me = await api(ctx, 'GET', 'auth/me');
  people[c.key] = { ...c, ctx, email, password, userId: me.user.id, handle: me.user.profile.handle };
  step(`${c.name} signed up, took the assessment, built an avatar`);
}

// Everyone follows the lead and the lead follows everyone, so the feed and the people map have real edges.
const lead = people.lead;
for (const p of Object.values(people)) {
  if (p === lead) continue;
  await api(p.ctx, 'POST', `follows/${lead.userId}`).catch(() => undefined);
  await api(lead.ctx, 'POST', `follows/${p.userId}`).catch(() => undefined);
}
step('follows');

// A circle, joined through its real invite link.
const { circle } = await api(lead.ctx, 'POST', 'circles', { name: 'Midnight Chai Club', description: 'Six friends, one group chat, zero plans that survive.', theme: 'dusk' }).then((r) => (r.circle ? r : { circle: r }));
const inv = await api(lead.ctx, 'POST', `circles/${circle.id}/invites`, {});
const token = inv.token ?? inv.invite?.token ?? /join\/([A-Za-z0-9_-]+)/.exec(JSON.stringify(inv))?.[1];
for (const k of ['kabir', 'meera', 'zoya', 'arjun', 'tara']) await api(people[k].ctx, 'POST', `circle-invites/${token}/accept`);
await api(lead.ctx, 'PATCH', `circles/${circle.id}`, { environment: 'islands' }).catch((e) => step(`environment skipped: ${e.message}`));
const second = await api(people.meera.ctx, 'POST', 'circles', { name: 'Sunday Football', description: 'Seven a side. Loser buys breakfast.', theme: 'jade' }).then((r) => r.circle ?? r);
const inv2 = await api(people.meera.ctx, 'POST', `circles/${second.id}/invites`, {});
const token2 = inv2.token ?? inv2.invite?.token ?? /join\/([A-Za-z0-9_-]+)/.exec(JSON.stringify(inv2))?.[1];
for (const k of ['lead', 'arjun', 'ishaan']) await api(people[k].ctx, 'POST', `circle-invites/${token2}/accept`);
step('circles');

// Thought Drops, then real reactions and replies from the rest of the cast.
const posts = [];
for (const d of DROPS) {
  const r = await api(people[d.by].ctx, 'POST', 'posts', { kind: d.kind, body: d.body, visibility: 'public', ...(d.pollOptions ? { pollOptions: d.pollOptions } : {}) });
  posts.push({ ...d, id: (r.post ?? r).id });
  await sleep(350); // distinct timestamps, so the feed order is stable
}
const kinds = ['star', 'heart', 'sun', 'moon'];
let n = 0;
for (const post of posts) {
  for (const p of Object.values(people)) {
    if (p.key === post.by || (n++ % 4 === 3)) continue;
    await api(p.ctx, 'POST', `posts/${post.id}/react`, { kind: kinds[n % kinds.length] }).catch(() => undefined);
  }
}
await api(people.meera.ctx, 'POST', `posts/${posts[5].id}/comments`, { body: 'This. Exactly this.' });
await api(people.kabir.ctx, 'POST', `posts/${posts[5].id}/comments`, { body: 'Saving this one.' });
await api(lead.ctx, 'POST', `posts/${posts[0].id}/comments`, { body: 'Every single time.' });
await api(lead.ctx, 'POST', 'posts', { kind: 'thought', body: 'Who is bringing the chai tonight?', visibility: 'group', groupId: circle.id });
await api(people.kabir.ctx, 'POST', 'posts', { kind: 'question', body: 'Trivia rematch on Friday?', visibility: 'group', groupId: circle.id });
step('thought drops, reactions, replies');

// A circle tournament with real, timed runs (the server holds back anything answered inhumanly fast).
const t = await api(people.noor.ctx, 'POST', 'circles', { name: 'Trivia Table', theme: 'aurora' }).then((r) => r.circle ?? r);
const inv3 = await api(people.noor.ctx, 'POST', `circles/${t.id}/invites`, {});
const token3 = inv3.token ?? inv3.invite?.token ?? /join\/([A-Za-z0-9_-]+)/.exec(JSON.stringify(inv3))?.[1];
for (const k of Object.keys(TRIVIA.plays)) await api(people[k].ctx, 'POST', `circle-invites/${token3}/accept`);
const made = await api(people.noor.ctx, 'POST', 'play/tournaments', { title: TRIVIA.title, questions: TRIVIA.questions, access: 'circle', circleId: t.id, closesAt: new Date(Date.now() + 6 * 864e5).toISOString(), secondsPerQuestion: 20 });
const tournamentId = (made.tournament ?? made).id;
const waits = [9000, 11500, 8200, 14000, 10300, 12600, 7400];
await Promise.all(Object.entries(TRIVIA.plays).map(async ([k, answers], i) => {
  const p = people[k];
  await api(p.ctx, 'POST', `play/tournaments/${tournamentId}/join`);
  await api(p.ctx, 'POST', `play/tournaments/${tournamentId}/start`);
  await sleep(waits[i]);
  await api(p.ctx, 'POST', `play/tournaments/${tournamentId}/submit`, { answers });
}));
step('tournament runs');

// Progress: a mood check-in, then the lead claims what she has honestly completed — quests first, and the
// season's first milestone if those points reach it. Nothing is granted that the product would not grant.
await api(lead.ctx, 'POST', 'vibe', { mood: 'calm' }).catch(() => undefined);
const progress = await api(lead.ctx, 'GET', 'progress');
for (const q of progress.quests.filter((x) => x.claimable)) await api(lead.ctx, 'POST', `quests/${q.key}/claim`).catch(() => undefined);
for (const season of (await api(lead.ctx, 'GET', 'progress')).seasons.filter((x) => x.status === 'current')) {
  for (const m of season.milestones.filter((x) => x.claimable)) await api(lead.ctx, 'POST', `seasons/${season.key}/milestones/${m.at}/claim`).catch(() => undefined);
}
step('progress');

mkdirSync(SHOOT, { recursive: true });
writeFileSync(resolve(SHOOT, 'accounts.json'), JSON.stringify({
  app: APP, circleId: circle.id, tournamentId, postId: posts[5].id,
  cast: Object.fromEntries(Object.values(people).map((p) => [p.key, { name: p.name, email: p.email, password: p.password, userId: p.userId, handle: p.handle }])),
}, null, 2));
for (const p of Object.values(people)) await p.ctx.dispose();
console.log(`Ready. Local sign-in details for the shoot are in ${resolve(SHOOT, 'accounts.json')} (git-ignored).`);
