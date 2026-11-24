/**
 * Member-made quizzes. One engine for both kinds:
 *  - trivia:  each question has exactly one correct option; the result is the number answered correctly.
 *  - outcome: "which one are you" — every option points to one of 2–4 outcomes; the outcome with the most
 *             points wins, ties broken by the order the author listed the outcomes (deterministic).
 * These are for fun between friends. They are not personality tests and never feed the archetype model.
 */
export type QuizKind = 'trivia' | 'outcome';
export interface QuizOption { text: string; correct?: boolean; outcome?: number }
export interface QuizQuestion { text: string; options: QuizOption[] }
export interface QuizOutcome { title: string; description: string }
export interface QuizDefinition { kind: QuizKind; title: string; description: string; questions: QuizQuestion[]; outcomes: QuizOutcome[] }

export const QUIZ_LIMITS = { minQuestions: 2, maxQuestions: 12, minOptions: 2, maxOptions: 4, minOutcomes: 2, maxOutcomes: 4, title: 80, text: 160, option: 80, description: 300 } as const;

export class QuizError extends Error {}

/** Throws QuizError with a human message for the first problem found. */
export function validateQuiz(q: QuizDefinition): void {
  const L = QUIZ_LIMITS;
  const len = (s: string, max: number, what: string) => { if (!s.trim()) throw new QuizError(`${what} can’t be empty.`); if (s.length > max) throw new QuizError(`${what} is too long (max ${max}).`); };
  len(q.title, L.title, 'The title');
  if (q.description.length > L.description) throw new QuizError('The description is too long.');
  if (q.questions.length < L.minQuestions || q.questions.length > L.maxQuestions) throw new QuizError(`Use ${L.minQuestions}–${L.maxQuestions} questions.`);
  if (q.kind === 'outcome') {
    if (q.outcomes.length < L.minOutcomes || q.outcomes.length > L.maxOutcomes) throw new QuizError(`Use ${L.minOutcomes}–${L.maxOutcomes} results.`);
    q.outcomes.forEach((o, i) => { len(o.title, L.title, `Result ${i + 1}`); if (o.description.length > L.description) throw new QuizError(`Result ${i + 1} description is too long.`); });
  } else if (q.outcomes.length) throw new QuizError('Trivia quizzes don’t have results.');
  q.questions.forEach((qq, i) => {
    len(qq.text, L.text, `Question ${i + 1}`);
    if (qq.options.length < L.minOptions || qq.options.length > L.maxOptions) throw new QuizError(`Question ${i + 1} needs ${L.minOptions}–${L.maxOptions} answers.`);
    qq.options.forEach((o, j) => len(o.text, L.option, `Answer ${j + 1} of question ${i + 1}`));
    if (new Set(qq.options.map((o) => o.text.trim().toLowerCase())).size !== qq.options.length) throw new QuizError(`Question ${i + 1} has duplicate answers.`);
    if (q.kind === 'trivia' && qq.options.filter((o) => o.correct).length !== 1) throw new QuizError(`Mark exactly one correct answer for question ${i + 1}.`);
    if (q.kind === 'outcome' && qq.options.some((o) => o.outcome === undefined || !Number.isInteger(o.outcome) || o.outcome < 0 || o.outcome >= q.outcomes.length)) throw new QuizError(`Every answer in question ${i + 1} must point to a result.`);
  });
  if (q.kind === 'outcome') {
    const reachable = new Set(q.questions.flatMap((qq) => qq.options.map((o) => o.outcome)));
    q.outcomes.forEach((o, i) => { if (!reachable.has(i)) throw new QuizError(`No answer leads to “${o.title}”.`); });
  }
}

export interface QuizResult { kind: QuizKind; score: number; total: number; outcome: number | null; correct: boolean[] | null }

/** answers[i] = chosen option index for question i (every question must be answered). */
export function scoreQuiz(q: QuizDefinition, answers: number[]): QuizResult {
  if (answers.length !== q.questions.length) throw new QuizError('Answer every question.');
  answers.forEach((a, i) => { if (!Number.isInteger(a) || a < 0 || a >= q.questions[i].options.length) throw new QuizError(`Choose an answer for question ${i + 1}.`); });
  if (q.kind === 'trivia') {
    const correct = answers.map((a, i) => !!q.questions[i].options[a].correct);
    return { kind: 'trivia', score: correct.filter(Boolean).length, total: q.questions.length, outcome: null, correct };
  }
  const tally = q.outcomes.map(() => 0);
  answers.forEach((a, i) => { tally[q.questions[i].options[a].outcome!]++; });
  const best = tally.reduce((bi, n, i) => (n > tally[bi] ? i : bi), 0);
  return { kind: 'outcome', score: tally[best], total: q.questions.length, outcome: best, correct: null };
}

/** What someone taking the quiz may see before answering: no correct flags, no outcome mapping. */
export function publicQuestions(q: QuizDefinition) {
  return q.questions.map((qq) => ({ text: qq.text, options: qq.options.map((o) => o.text) }));
}
