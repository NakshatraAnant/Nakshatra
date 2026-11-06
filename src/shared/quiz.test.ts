import { describe, expect, it } from 'vitest';
import { publicQuestions, QuizError, scoreQuiz, validateQuiz, type QuizDefinition } from './quiz';

const trivia: QuizDefinition = { kind: 'trivia', title: 'How well do you know me?', description: '', outcomes: [], questions: [
  { text: 'Favourite snack?', options: [{ text: 'Samosa', correct: true }, { text: 'Chips' }] },
  { text: 'Morning or night?', options: [{ text: 'Morning' }, { text: 'Night', correct: true }, { text: 'Both' }] },
] };
const outcome: QuizDefinition = { kind: 'outcome', title: 'Which chai are you?', description: 'Just for fun', outcomes: [{ title: 'Masala', description: '' }, { title: 'Ginger', description: '' }], questions: [
  { text: 'Pick a weekend', options: [{ text: 'Trek', outcome: 0 }, { text: 'Nap', outcome: 1 }] },
  { text: 'Pick a song', options: [{ text: 'Loud', outcome: 0 }, { text: 'Soft', outcome: 1 }] },
] };

describe('quiz engine', () => {
  it('validates both kinds and explains problems', () => {
    expect(() => validateQuiz(trivia)).not.toThrow();
    expect(() => validateQuiz(outcome)).not.toThrow();
    expect(() => validateQuiz({ ...trivia, questions: [trivia.questions[0]] })).toThrow(QuizError);
    expect(() => validateQuiz({ ...trivia, questions: [trivia.questions[0], { text: 'x', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] }] })).toThrow(/exactly one correct/);
    expect(() => validateQuiz({ ...outcome, questions: outcome.questions.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o, outcome: 0 })) })) })).toThrow(/No answer leads/);
    expect(() => validateQuiz({ ...trivia, questions: [trivia.questions[0], { text: 'dup', options: [{ text: 'A', correct: true }, { text: 'a' }] }] })).toThrow(/duplicate/);
  });
  it('scores trivia and outcome quizzes deterministically, with ties going to the first result', () => {
    expect(scoreQuiz(trivia, [0, 1])).toMatchObject({ score: 2, total: 2, correct: [true, true] });
    expect(scoreQuiz(trivia, [1, 0]).score).toBe(0);
    expect(scoreQuiz(outcome, [1, 1]).outcome).toBe(1);
    expect(scoreQuiz(outcome, [0, 1]).outcome).toBe(0);
    expect(() => scoreQuiz(trivia, [0])).toThrow(QuizError);
    expect(() => scoreQuiz(trivia, [0, 5])).toThrow(QuizError);
  });
  it('never reveals answers or result mapping to takers', () => {
    const raw = JSON.stringify(publicQuestions(trivia)) + JSON.stringify(publicQuestions(outcome));
    expect(raw).not.toContain('correct');
    expect(raw).not.toContain('outcome');
  });
});
