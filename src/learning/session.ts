/**
 * Practice sessions / quizzes: an ordered, deterministic list of exercises
 * for a topic (or a mix), plus scoring.
 *
 * OWNER: Learning System.
 */
import { exerciseLabel, generateExercise } from './exercises';
import type { Difficulty, Exercise, Feedback, Topic } from './types';
import { SENTENTIAL_TOPICS, TOPICS, clampDifficulty } from './types';
import { hash, makeRng, pick, shuffle } from './util';

export interface PracticeSessionConfig {
  topic: Topic | 'mixed';
  /** Base difficulty. For a mixed session, `difficultyByTopic` overrides per topic. */
  difficulty: Difficulty;
  count: number;
  seed: number;
  /** For 'mixed': which topics to draw from (default: SENTENTIAL_TOPICS; pass PREDICATE_TOPICS or TOPICS for predicate logic). */
  topics?: Topic[];
  /** Per-topic difficulty, e.g. from ProgressStore.recommendedDifficulty. */
  difficultyByTopic?: Partial<Record<Topic, Difficulty>>;
  /** Ramp difficulty up across the session (−1 at the start … +1 at the end). Default false. */
  ramp?: boolean;
}

export interface PracticeSession {
  id: string;
  config: PracticeSessionConfig;
  exercises: Exercise[];
}

/** Build a practice session. Same config (incl. seed) ⇒ same exercises. */
export function createPracticeSession(config: PracticeSessionConfig): PracticeSession {
  const count = Math.max(1, Math.min(100, Math.floor(config.count)));
  const rng = makeRng(config.seed);
  const pool = config.topic === 'mixed' ? (config.topics?.length ? config.topics : [...SENTENTIAL_TOPICS]) : [config.topic];
  const exercises: Exercise[] = [];
  const used = new Set<string>();
  // For mixed sessions, cycle through a shuffled topic order so topics are spread evenly.
  let order: Topic[] = [];
  for (let i = 0; i < count; i++) {
    if (!order.length) order = shuffle(rng, pool);
    const topic = config.topic === 'mixed' ? order.shift()! : pool[0];
    const base = config.difficultyByTopic?.[topic] ?? config.difficulty;
    const ramp = config.ramp && count > 1 ? Math.round(-1 + (2 * i) / (count - 1)) : 0;
    const difficulty = clampDifficulty(base + ramp);
    let ex: Exercise | null = null;
    for (let tries = 0; tries < 8; tries++) {
      const cand = generateExercise(topic, difficulty, Math.floor(rng() * 0x7fffffff), { exclude: used });
      ex = cand;
      if (!used.has(cand.id)) break;
    }
    used.add(ex!.id);
    exercises.push(ex!);
  }
  return { id: `session-${hash(JSON.stringify({ ...config, count }))}`, config: { ...config, count }, exercises };
}

/** Pick a single random topic for "surprise me". */
export function randomTopic(seed: number, topics: readonly Topic[] = TOPICS): Topic {
  return pick(makeRng(seed), topics);
}

export interface ExerciseResult {
  exerciseId: string;
  /** The latest feedback for this exercise (or a bare correctness flag). */
  feedback?: Pick<Feedback, 'correct' | 'partial'>;
  correct?: boolean;
  hintsUsed?: number;
  solutionViewed?: boolean;
  skipped?: boolean;
  timeMs?: number;
  /** How many times the student pressed Check on this exercise (default 1). */
  attempts?: number;
  /**
   * Was the FIRST check fully correct? Defaults to the final correctness when
   * attempts ≤ 1, otherwise false. `mergeResult` fills this in for you.
   */
  firstTryCorrect?: boolean;
}

const finalCorrect = (r: ExerciseResult) => r.feedback?.correct ?? r.correct ?? false;
const firstTry = (r: ExerciseResult) => r.firstTryCorrect ?? ((r.attempts ?? 1) <= 1 && finalCorrect(r));

/**
 * Add a result to a session's result list, merging with an earlier result for
 * the same exercise (a Retry): keeps the first try's correctness, counts the
 * attempts, and takes the latest correctness/hints/time. Use this instead of
 * replacing the earlier result, or retries will look like first-try successes.
 */
export function mergeResult(results: readonly ExerciseResult[], r: ExerciseResult): ExerciseResult[] {
  const prev = results.find((x) => x.exerciseId === r.exerciseId);
  const merged: ExerciseResult = prev
    ? {
        ...r,
        attempts: (prev.attempts ?? 1) + (r.attempts ?? 1),
        firstTryCorrect: firstTry(prev),
        hintsUsed: Math.max(prev.hintsUsed ?? 0, r.hintsUsed ?? 0),
        solutionViewed: Boolean(prev.solutionViewed || r.solutionViewed),
      }
    : { ...r, attempts: r.attempts ?? 1, firstTryCorrect: firstTry(r) };
  return [...results.filter((x) => x.exerciseId !== r.exerciseId), merged];
}

export interface ReviewItem {
  exerciseId: string;
  topic: Topic;
  title: string;
  /** Concrete, exercise-specific label: the formula, sentence or argument. */
  label: string;
  /** Why it is listed. */
  reason: 'wrong' | 'correct-after-retry' | 'solution-viewed' | 'partial';
}

/**
 * Scoring semantics (documented contract):
 *  - `firstTryCorrect` / `firstTryAccuracy` count only exercises answered fully
 *    correctly on the FIRST check. This is the headline number.
 *  - `correct` (a.k.a. eventually correct) counts exercises that ended correct,
 *    including after retries; `correctAfterRetry` is the difference.
 *  - `score` (0–100): first-try correct = 1, correct after retry = 0.5,
 *    ended partially right = 0.25, wrong / skipped / solution viewed = 0;
 *    each hint costs 0.1 of the item (at most half of it).
 *  - ProgressStore accuracy is per recorded ATTEMPT (every Check is one attempt,
 *    partial = ½), so a retry-heavy session lowers it too; the two agree when
 *    every exercise is answered once.
 */
export interface SessionScore {
  total: number;
  answered: number;
  /** Ended correct (first try or after retries). */
  correct: number;
  firstTryCorrect: number;
  correctAfterRetry: number;
  partial: number;
  skipped: number;
  /** firstTryCorrect / total, 0–1 (null for an empty session). */
  firstTryAccuracy: number | null;
  score: number;
  hintsUsed: number;
  totalTimeMs: number;
  byTopic: Partial<Record<Topic, { total: number; correct: number; firstTryCorrect: number; points: number }>>;
  /** Ids of exercises worth reviewing (wrong, retried, partial, or solution viewed). */
  toReview: string[];
  /** The same, with concrete labels for display. */
  review: ReviewItem[];
}

export function pointsFor(r: ExerciseResult): number {
  if (r.skipped || r.solutionViewed) return 0;
  const partial = r.feedback?.partial ?? false;
  const base = firstTry(r) ? 1 : finalCorrect(r) ? 0.5 : partial ? 0.25 : 0;
  const penalty = Math.min(base / 2, 0.1 * (r.hintsUsed ?? 0));
  return Math.max(0, base - penalty);
}

export function scoreSession(session: PracticeSession, results: readonly ExerciseResult[]): SessionScore {
  const byId = new Map(results.map((r) => [r.exerciseId, r]));
  const out: SessionScore = {
    total: session.exercises.length, answered: 0, correct: 0, firstTryCorrect: 0, correctAfterRetry: 0, partial: 0, skipped: 0,
    firstTryAccuracy: null, score: 0, hintsUsed: 0, totalTimeMs: 0, byTopic: {}, toReview: [], review: [],
  };
  let points = 0;
  for (const ex of session.exercises) {
    const r = byId.get(ex.id);
    const t = (out.byTopic[ex.topic] ??= { total: 0, correct: 0, firstTryCorrect: 0, points: 0 });
    t.total++;
    if (!r || r.skipped) {
      out.skipped++;
      continue;
    }
    out.answered++;
    const correct = finalCorrect(r);
    const first = firstTry(r);
    let reason: ReviewItem['reason'] | null = null;
    if (correct) {
      out.correct++;
      t.correct++;
      if (first) {
        out.firstTryCorrect++;
        t.firstTryCorrect++;
      } else {
        out.correctAfterRetry++;
        reason = 'correct-after-retry';
      }
    } else if (r.feedback?.partial) {
      out.partial++;
      reason = 'partial';
    } else reason = 'wrong';
    if (r.solutionViewed) reason = 'solution-viewed';
    if (reason) {
      out.toReview.push(ex.id);
      out.review.push({ exerciseId: ex.id, topic: ex.topic, title: ex.title, label: exerciseLabel(ex), reason });
    }
    out.hintsUsed += r.hintsUsed ?? 0;
    out.totalTimeMs += r.timeMs ?? 0;
    const p = pointsFor(r);
    points += p;
    t.points += p;
  }
  out.firstTryAccuracy = out.total ? out.firstTryCorrect / out.total : null;
  out.score = out.total ? Math.round((100 * points) / out.total) : 0;
  return out;
}
