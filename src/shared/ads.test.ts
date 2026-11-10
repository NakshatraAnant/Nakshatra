import { describe, expect, it } from 'vitest';
import { adPolicyIssues, canMoveAd, matchesContext, whyThisAd, sponsoredContentIssues } from './ads';

const ok = { headline: 'Fresh filter coffee, delivered', body: 'Small-batch beans from Chikmagalur.', ctaLabel: 'Order', destinationUrl: 'https://example.com/coffee' };

describe('ad policy', () => {
  it('passes a plain ad and blocks sensitive or identity messaging', () => {
    expect(adPolicyIssues(ok, { topics: ['food'], languages: [] })).toEqual([]);
    expect(adPolicyIssues({ ...ok, headline: 'Perfect for introverts like you' }, { topics: [], languages: [] })[0]).toMatch(/sensitive/);
    expect(adPolicyIssues({ ...ok, body: 'Scorpio? This one is for you.' }, { topics: [], languages: [] })[0]).toMatch(/scorpio/);
    expect(adPolicyIssues({ ...ok, body: 'Matches for your caste' }, { topics: [], languages: [] })[0]).toMatch(/caste/);
    expect(adPolicyIssues({ ...ok, body: 'Deals for Geminis this week' }, { topics: [], languages: [] })[0]).toMatch(/gemini/);
    expect(adPolicyIssues({ ...ok, body: 'Cancer-free cookware' }, { topics: [], languages: [] })[0]).toMatch(/cancer/);
  });

  it('rejects unsafe links and non-contextual targeting', () => {
    expect(adPolicyIssues({ ...ok, destinationUrl: 'http://example.com' }, { topics: [], languages: [] })).toContain('The link must be a plain https:// address.');
    expect(adPolicyIssues(ok, { topics: ['vedic' as never], languages: [] })).toContain('Only the listed contextual topics can be targeted.');
    expect(adPolicyIssues(ok, { topics: ['relationships' as never], languages: [] })).toContain('Only the listed contextual topics can be targeted.');
  });

  it('matches only the browsing context, and explains without mentioning the member', () => {
    expect(matchesContext({ topics: [], languages: [] }, { topic: null, language: 'en' })).toBe(true);
    expect(matchesContext({ topics: ['food'], languages: [] }, { topic: null, language: 'en' })).toBe(false);
    expect(matchesContext({ topics: ['food'], languages: [] }, { topic: 'food', language: 'en' })).toBe(true);
    expect(matchesContext({ topics: [], languages: ['hi'] }, { topic: null, language: 'en' })).toBe(false);
    expect(whyThisAd({ topics: ['food'], languages: [] }, { topic: 'food' })).toMatch(/browsing “food”.*never based on your profile/);
  });

  it('allows only sensible status changes', () => {
    expect(canMoveAd('draft', 'approved')).toBe(false);
    expect(canMoveAd('in_review', 'approved')).toBe(true);
    expect(canMoveAd('ended', 'approved')).toBe(false);
    expect(canMoveAd('approved', 'paused')).toBe(true);
  });
});

describe('sponsored quizzes and challenges', () => {
  const trivia = { kind: 'trivia' as const, title: 'Monsoon snacks', description: '', outcomes: [], questions: [
    { text: 'Which pairs best with chai?', options: [{ text: 'Pakoras', correct: true }, { text: 'Ice cream', correct: false }] },
    { text: 'Vada pav is from…', options: [{ text: 'Mumbai', correct: true }, { text: 'Kochi', correct: false }] },
  ] };
  it('accepts clean trivia and challenges', () => {
    expect(sponsoredContentIssues('quiz', trivia)).toEqual([]);
    expect(sponsoredContentIssues('quest', { title: 'Cook something new', description: 'This week', steps: ['Pick a recipe', 'Share a photo drop'] })).toEqual([]);
    expect(sponsoredContentIssues('feed', null)).toEqual([]);
  });
  it('refuses outcome quizzes, sensitive topics and malformed content', () => {
    expect(sponsoredContentIssues('quiz', { ...trivia, kind: 'outcome' })[0]).toMatch(/profile people/);
    expect(sponsoredContentIssues('quiz', { ...trivia, title: 'Snacks for introverts' })[0]).toMatch(/sensitive/);
    expect(sponsoredContentIssues('quest', { title: 'Scorpios unite', description: '', steps: ['Go'] })[0]).toMatch(/sensitive/);
    expect(sponsoredContentIssues('quest', { title: 'Ok title', description: '', steps: [] })[0]).toMatch(/steps/);
    expect(sponsoredContentIssues('quiz', null)).toHaveLength(1);
    expect(sponsoredContentIssues('feed', trivia)).toHaveLength(1);
  });
});
