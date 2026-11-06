import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const trivia = { kind: 'trivia', title: 'How well do you know me?', description: '', outcomes: [], questions: [
  { text: 'Favourite snack?', options: [{ text: 'Samosa', correct: true }, { text: 'Chips' }] },
  { text: 'Morning or night?', options: [{ text: 'Morning' }, { text: 'Night', correct: true }] },
] };
const outcome = { kind: 'outcome', title: 'Which chai are you?', description: 'For fun', outcomes: [{ title: 'Masala', description: 'Bold' }, { title: 'Ginger', description: 'Warm' }], questions: [
  { text: 'Pick a weekend', options: [{ text: 'Trek', outcome: 0 }, { text: 'Nap', outcome: 1 }] },
  { text: 'Pick a song', options: [{ text: 'Loud', outcome: 0 }, { text: 'Soft', outcome: 1 }] },
] };

describe('Member quizzes', () => {
  it('create → take → result; answers hidden until submitted; one attempt each; author sees only aggregates', async () => {
    const author = await signup(t, 'Quiz Author', { birth: false });
    const taker = await signup(t, 'Quiz Taker', { birth: false });
    expect((await author.c.req('POST', '/api/v1/play/quizzes', { definition: { ...trivia, questions: [trivia.questions[0]] } })).status).toBe(400);
    const { quiz } = await author.c.post('/api/v1/play/quizzes', { definition: trivia }, 201);
    const view = await taker.c.get(`/api/v1/play/quizzes/${quiz.id}`);
    expect(JSON.stringify(view.quiz)).not.toContain('correct');
    expect(view.result).toBeNull();
    expect((await author.c.req('POST', `/api/v1/play/quizzes/${quiz.id}/attempts`, { answers: [0, 1] })).status).toBe(400);
    expect((await taker.c.req('POST', `/api/v1/play/quizzes/${quiz.id}/attempts`, { answers: [0] })).status).toBe(400);
    const r = await taker.c.post(`/api/v1/play/quizzes/${quiz.id}/attempts`, { answers: [0, 0] });
    expect(r.result).toMatchObject({ kind: 'trivia', score: 1, total: 2 });
    expect(r.result.review[1]).toMatchObject({ chosen: 'Morning', correct: 'Night', right: false });
    await taker.c.post(`/api/v1/play/quizzes/${quiz.id}/attempts`, { answers: [0, 1] }); // retake replaces
    const mine = await author.c.get(`/api/v1/play/quizzes/${quiz.id}`);
    expect(mine.summary).toMatchObject({ takes: 1, averageScore: 2 });
    expect(JSON.stringify(mine)).not.toContain(taker.userId);

    const o = (await author.c.post('/api/v1/play/quizzes', { definition: outcome }, 201)).quiz;
    const res = await taker.c.post(`/api/v1/play/quizzes/${o.id}/attempts`, { answers: [1, 1] });
    expect(res.result.outcome.title).toBe('Ginger');
    expect((await author.c.get(`/api/v1/play/quizzes/${o.id}`)).summary.outcomes).toEqual([{ title: 'Masala', n: 0 }, { title: 'Ginger', n: 1 }]);
    const list = await taker.c.get('/api/v1/play/quizzes');
    expect(list.quizzes.find((q: { id: string }) => q.id === quiz.id).taken).toBe(true);
  });

  it('circle quizzes stay in the circle; blocks hide quizzes; removed quizzes disappear; quizzes are reportable', async () => {
    const owner = await signup(t, 'Circle Quizzer', { birth: false });
    const outsider = await signup(t, 'Quiz Outsider', { birth: false });
    const { circle } = await owner.c.post('/api/v1/circles', { name: `Quiz circle ${Date.now() % 1000}` });
    expect((await outsider.c.req('POST', '/api/v1/play/quizzes', { definition: trivia, visibility: 'circle', circleId: circle.id })).status).toBe(403);
    const cq = (await owner.c.post('/api/v1/play/quizzes', { definition: trivia, visibility: 'circle', circleId: circle.id }, 201)).quiz;
    expect((await outsider.c.req('GET', `/api/v1/play/quizzes/${cq.id}`)).status).toBe(404);
    expect((await outsider.c.get('/api/v1/play/quizzes')).quizzes.map((q: { id: string }) => q.id)).not.toContain(cq.id);

    const pub = (await owner.c.post('/api/v1/play/quizzes', { definition: outcome }, 201)).quiz;
    expect((await outsider.c.req('POST', '/api/v1/reports', { targetType: 'quiz', targetId: pub.id, reason: 'spam' })).status).toBe(200);
    await outsider.c.post(`/api/v1/blocks/${owner.userId}`);
    expect((await outsider.c.req('GET', `/api/v1/play/quizzes/${pub.id}`)).status).toBe(404);
    expect((await outsider.c.req('DELETE', `/api/v1/play/quizzes/${pub.id}`)).status).toBe(404);
    await owner.c.req('DELETE', `/api/v1/play/quizzes/${pub.id}`);
    expect((await owner.c.req('GET', `/api/v1/play/quizzes/${pub.id}`)).status).toBe(404);
  });
});
