/**
 * Practice sessions / quizzes: an ordered, deterministic list of exercises
 * for a topic (or a mix), plus scoring.
 *
 * OWNER: Learning System.
 */
import { generateExercise } from './exercises';
import type { Difficulty, Exercise, Feedback, Topic } from './types';
import { TOPICS, clampDifficulty } from './types';
import { hash, makeRng, pick, shuffle } from './util';

export interface PracticeSessionConfig {
  topic: Topic | 'mixed';
  /** Base difficulty. For a mixed session, `difficultyByTopic` overrides per topic. */
  difficulty: Difficulty;
  count: number;
  seed: number;
  /** For 'mixed': which topics to draw from (default: all). */
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
  const pool = config.topic === 'mixed' ? (config.topics?.length ? config.topics : [...TOPICS]) : [config.topic];
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
  /** The final feedback for this exercise (or a bare correctness flag). */
  feedback?: Pick<Feedback, 'correct' | 'partial'>;
  correct?: boolean;
  hintsUsed?: number;
  solutionViewed?: boolean;
  skipped?: boolean;
  timeMs?: number;
}

export interface SessionScore {
  total: number;
  answered: number;
  correct: number;
  partial: number;
  skipped: number;
  /** 0–100. Correct = 1, partial = 0.5; each hint costs 0.1 (max 0.5); viewing the solution scores 0. */
  score: number;
  hintsUsed: number;
  totalTimeMs: number;
  byTopic: Partial<Record<Topic, { total: number; correct: number; points: number }>>;
  /** Exercises answered incorrectly or with the solution revealed, for "review mistakes". */
  toReview: string[];
}

export function pointsFor(r: ExerciseResult): number {
  if (r.skipped || r.solutionViewed) return 0;
  const correct = r.feedback?.correct ?? r.correct ?? false;
  const partial = r.feedback?.partial ?? false;
  const base = correct ? 1 : partial ? 0.5 : 0;
  const penalty = Math.min(0.5, 0.1 * (r.hintsUsed ?? 0));
  return Math.max(0, base - (base > 0 ? penalty : 0));
}

export function scoreSession(session: PracticeSession, results: readonly ExerciseResult[]): SessionScore {
  const byId = new Map(results.map((r) => [r.exerciseId, r]));
  const out: SessionScore = { total: session.exercises.length, answered: 0, correct: 0, partial: 0, skipped: 0, score: 0, hintsUsed: 0, totalTimeMs: 0, byTopic: {}, toReview: [] };
  let points = 0;
  for (const ex of session.exercises) {
    const r = byId.get(ex.id);
    const t = (out.byTopic[ex.topic] ??= { total: 0, correct: 0, points: 0 });
    t.total++;
    if (!r || r.skipped) {
      out.skipped++;
      continue;
    }
    out.answered++;
    const correct = r.feedback?.correct ?? r.correct ?? false;
    if (correct) {
      out.correct++;
      t.correct++;
    } else if (r.feedback?.partial) out.partial++;
    if (!correct || r.solutionViewed) out.toReview.push(ex.id);
    out.hintsUsed += r.hintsUsed ?? 0;
    out.totalTimeMs += r.timeMs ?? 0;
    const p = pointsFor(r);
    points += p;
    t.points += p;
  }
  out.score = out.total ? Math.round((100 * points) / out.total) : 0;
  return out;
}
