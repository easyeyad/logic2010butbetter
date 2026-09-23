/**
 * Progress tracking over an injectable key-value storage (localStorage in
 * the browser, an in-memory map in tests). Stores attempts, the "continue"
 * exercise and saved derivation drafts; derives per-topic stats, streaks,
 * weak areas, adaptive difficulty and a recommended next practice.
 *
 * Resilient by design: corrupt or unknown data is backed up under
 * `<key>:corrupt` and replaced with a fresh state; individual malformed
 * records are dropped; storage write failures (quota, privacy mode) are
 * swallowed and the store keeps working in memory.
 *
 * OWNER: Learning System.
 */
import type { DerivationDraft } from '../proof';
import type { Answer, Difficulty, Exercise, Topic } from './types';
import { TOPICS, TOPIC_INFO, clampDifficulty } from './types';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** The subset of the Web Storage API the store needs. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { dump(): Record<string, string> } {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

/** window.localStorage when usable, otherwise an in-memory fallback. */
export function getDefaultStorage(): KeyValueStorage {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    if (ls) {
      const probe = '__logic_studio_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    /* blocked / privacy mode */
  }
  return createMemoryStorage();
}

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export interface AttemptRecord {
  exerciseId: string;
  topic: Topic;
  difficulty: Difficulty;
  correct: boolean;
  partial?: boolean;
  hintsUsed: number;
  timeMs: number;
  timestamp: number;
  /** The student revealed the solution. */
  solutionViewed?: boolean;
}

export type AttemptInput = Omit<AttemptRecord, 'timestamp'> & { timestamp?: number };

export interface LastExerciseRecord {
  exercise: Exercise;
  savedAt: number;
  /** Work in progress, so the UI can restore the input. */
  answerDraft?: Answer;
  hintsShown?: number;
  sessionId?: string;
}

export type ProofStatus = 'in-progress' | 'complete';

export interface ProofDraftRecord {
  id: string;
  title: string;
  exerciseId?: string;
  draft: DerivationDraft;
  status: ProofStatus;
  createdAt: number;
  updatedAt: number;
}

export const PROGRESS_SCHEMA_VERSION = 1;

export interface ProgressData {
  version: typeof PROGRESS_SCHEMA_VERSION;
  createdAt: number;
  attempts: AttemptRecord[];
  lastExercise?: LastExerciseRecord;
  proofs: ProofDraftRecord[];
}

export interface TopicStats {
  topic: Topic;
  title: string;
  attempts: number;
  correct: number;
  partial: number;
  /** All-time accuracy 0–1 (partial counts half); null with no attempts. */
  accuracy: number | null;
  /** Recency-weighted accuracy 0–1; null with no attempts. */
  recentAccuracy: number | null;
  lastPracticed?: number;
  averageTimeMs: number;
  hintsPerAttempt: number;
  /** Adaptive difficulty the student should practise next in this topic. */
  level: Difficulty;
}

export interface StreakInfo {
  /** Consecutive days with practice ending today (or yesterday, if not yet practised today). */
  current: number;
  longest: number;
  practicedToday: boolean;
  lastPracticeDay?: string;
}

export interface WeakArea {
  topic: Topic;
  /** Recency-weighted accuracy 0–1. */
  accuracy: number;
  attempts: number;
  reason: string;
}

export interface Recommendation {
  topic: Topic;
  difficulty: Difficulty;
  kind: 'start' | 'weak-area' | 'new-topic' | 'review';
  reason: string;
}

export interface DayActivity {
  /** Local date, YYYY-MM-DD. */
  date: string;
  attempts: number;
  correct: number;
}

export interface ProgressOverview {
  totalAttempts: number;
  correct: number;
  accuracy: number | null;
  streak: StreakInfo;
  topics: TopicStats[];
  weakAreas: WeakArea[];
  recommendation: Recommendation;
  recentActivity: AttemptRecord[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** Local calendar date of a timestamp, YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + delta, 12).getTime());
}

const score = (a: AttemptRecord) => (a.correct ? 1 : a.partial ? 0.5 : 0);
const isTopic = (t: unknown): t is Topic => typeof t === 'string' && (TOPICS as readonly string[]).includes(t);
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function sanitizeAttempt(x: unknown): AttemptRecord | null {
  if (!x || typeof x !== 'object') return null;
  const a = x as Record<string, unknown>;
  if (typeof a.exerciseId !== 'string' || !isTopic(a.topic) || typeof a.correct !== 'boolean' || !isNum(a.timestamp)) return null;
  return {
    exerciseId: a.exerciseId,
    topic: a.topic,
    difficulty: clampDifficulty(isNum(a.difficulty) ? a.difficulty : 1),
    correct: a.correct,
    ...(a.partial === true ? { partial: true } : {}),
    hintsUsed: isNum(a.hintsUsed) && a.hintsUsed >= 0 ? Math.floor(a.hintsUsed) : 0,
    timeMs: isNum(a.timeMs) && a.timeMs >= 0 ? a.timeMs : 0,
    timestamp: a.timestamp,
    ...(a.solutionViewed === true ? { solutionViewed: true } : {}),
  };
}

function sanitizeProof(x: unknown): ProofDraftRecord | null {
  if (!x || typeof x !== 'object') return null;
  const p = x as Record<string, unknown>;
  const d = p.draft as DerivationDraft | undefined;
  if (typeof p.id !== 'string' || !d || typeof d !== 'object' || !Array.isArray(d.lines)) return null;
  return {
    id: p.id,
    title: typeof p.title === 'string' ? p.title : 'Untitled proof',
    ...(typeof p.exerciseId === 'string' ? { exerciseId: p.exerciseId } : {}),
    draft: d,
    status: p.status === 'complete' ? 'complete' : 'in-progress',
    createdAt: isNum(p.createdAt) ? p.createdAt : 0,
    updatedAt: isNum(p.updatedAt) ? p.updatedAt : 0,
  };
}

function sanitizeLast(x: unknown): LastExerciseRecord | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const l = x as Record<string, unknown>;
  const ex = l.exercise as Exercise | undefined;
  if (!ex || typeof ex !== 'object' || typeof ex.id !== 'string' || !isTopic(ex.kind)) return undefined;
  return {
    exercise: ex,
    savedAt: isNum(l.savedAt) ? l.savedAt : 0,
    ...(l.answerDraft && typeof l.answerDraft === 'object' ? { answerDraft: l.answerDraft as Answer } : {}),
    ...(isNum(l.hintsShown) ? { hintsShown: l.hintsShown } : {}),
    ...(typeof l.sessionId === 'string' ? { sessionId: l.sessionId } : {}),
  };
}

// ---------------------------------------------------------------------------
// Adaptive difficulty
// ---------------------------------------------------------------------------

/** Consecutive clean successes at the current level needed to move up. */
export const PROMOTE_AFTER = 3;
/** Failures within the last three attempts that move the level down. */
export const DEMOTE_AFTER = 2;

/**
 * Replay a topic's attempts (oldest first) to find the level to practise
 * next. Three clean successes (correct, ≤1 hint, no solution peek) in a row
 * at or above the current level → one level up; two failures among the last
 * three attempts since the last change → one level down.
 */
export function adaptiveLevel(attempts: readonly AttemptRecord[], start: Difficulty = 1): Difficulty {
  let level: number = start;
  let run = 0;
  let window: boolean[] = [];
  for (const a of attempts) {
    const clean = a.correct && a.hintsUsed <= 1 && !a.solutionViewed;
    const failed = !a.correct && !a.partial;
    if (clean && a.difficulty >= level) {
      run++;
      window.push(true);
      if (run >= PROMOTE_AFTER && level < 5) {
        level++;
        run = 0;
        window = [];
        continue;
      }
    } else if (failed || a.solutionViewed) {
      run = 0;
      window.push(false);
    } else if (!a.correct) {
      run = 0; // partial: resets the run but is not a failure
    }
    window = window.slice(-3);
    if (window.filter((w) => !w).length >= DEMOTE_AFTER && level > 1) {
      level--;
      run = 0;
      window = [];
    }
  }
  return clampDifficulty(level);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface ProgressStoreOptions {
  /** Clock (ms since epoch). Inject a fake in tests. */
  now?: () => number;
  /** Storage key. Default 'logic-studio:progress'. */
  key?: string;
  /** Keep at most this many attempts (oldest dropped). Default 5000. */
  maxAttempts?: number;
  /** Keep at most this many saved proofs. Default 100. */
  maxProofs?: number;
}

export type LoadIssue = 'corrupt' | 'unsupported-version' | null;

export class ProgressStore {
  readonly key: string;
  /** Set if the stored data could not be used at load time (it was backed up and reset). */
  readonly loadIssue: LoadIssue = null;
  private data: ProgressData;
  private readonly now: () => number;
  private readonly maxAttempts: number;
  private readonly maxProofs: number;
  private listeners = new Set<() => void>();

  constructor(private readonly storage: KeyValueStorage = getDefaultStorage(), options: ProgressStoreOptions = {}) {
    this.key = options.key ?? 'logic-studio:progress';
    this.now = options.now ?? (() => Date.now());
    this.maxAttempts = options.maxAttempts ?? 5000;
    this.maxProofs = options.maxProofs ?? 100;
    const { data, issue } = this.load();
    this.data = data;
    this.loadIssue = issue;
  }

  // ------------------------------------------------------------ persistence

  private fresh(): ProgressData {
    return { version: PROGRESS_SCHEMA_VERSION, createdAt: this.now(), attempts: [], proofs: [] };
  }

  private load(): { data: ProgressData; issue: LoadIssue } {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return { data: this.fresh(), issue: null };
    }
    if (raw === null || raw === '') return { data: this.fresh(), issue: null };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.backup(raw);
      return { data: this.fresh(), issue: 'corrupt' };
    }
    const migrated = migrate(parsed);
    if (!migrated.ok) {
      this.backup(raw);
      return { data: this.fresh(), issue: migrated.issue };
    }
    return { data: migrated.data, issue: null };
  }

  private backup(raw: string): void {
    try {
      this.storage.setItem(`${this.key}:corrupt`, raw);
    } catch {
      /* ignore */
    }
  }

  private commit(next: ProgressData): void {
    this.data = next;
    try {
      this.storage.setItem(this.key, JSON.stringify(next));
    } catch {
      /* quota / privacy mode: keep working in memory */
    }
    for (const l of this.listeners) l();
  }

  /** Subscribe to changes (e.g. with React's useSyncExternalStore). Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Immutable snapshot; a new object after every change. */
  getSnapshot(): ProgressData {
    return this.data;
  }

  /** Serialized data for "export progress". */
  exportData(): string {
    return JSON.stringify(this.data);
  }

  /** Replace all data from an export. Returns false (and changes nothing) if it is unusable. */
  importData(json: string): boolean {
    try {
      const m = migrate(JSON.parse(json));
      if (!m.ok) return false;
      this.commit(m.data);
      return true;
    } catch {
      return false;
    }
  }

  reset(): void {
    this.commit(this.fresh());
  }

  // ------------------------------------------------------------ attempts

  recordAttempt(input: AttemptInput): AttemptRecord {
    const rec = sanitizeAttempt({ ...input, timestamp: input.timestamp ?? this.now() });
    if (!rec) throw new Error('Invalid attempt record');
    const attempts = [...this.data.attempts, rec].slice(-this.maxAttempts);
    const clearLast = rec.correct && this.data.lastExercise?.exercise.id === rec.exerciseId;
    this.commit({ ...this.data, attempts, lastExercise: clearLast ? undefined : this.data.lastExercise });
    return rec;
  }

  getAttempts(filter?: { topic?: Topic; exerciseId?: string; since?: number }): AttemptRecord[] {
    return this.data.attempts.filter(
      (a) => (!filter?.topic || a.topic === filter.topic) && (!filter?.exerciseId || a.exerciseId === filter.exerciseId) && (filter?.since === undefined || a.timestamp >= filter.since),
    );
  }

  /** Most recent attempts first. */
  recentActivity(limit = 10): AttemptRecord[] {
    return [...this.data.attempts].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  /** Attempts per local day for the last `days` days (oldest first, including today). */
  activityByDay(days = 14): DayActivity[] {
    const today = dayKey(this.now());
    const map = new Map<string, DayActivity>();
    for (let i = days - 1; i >= 0; i--) {
      const k = shiftDay(today, -i);
      map.set(k, { date: k, attempts: 0, correct: 0 });
    }
    for (const a of this.data.attempts) {
      const d = map.get(dayKey(a.timestamp));
      if (d) {
        d.attempts++;
        if (a.correct) d.correct++;
      }
    }
    return [...map.values()];
  }

  /** Has this exercise ever been answered correctly? */
  isSolved(exerciseId: string): boolean {
    return this.data.attempts.some((a) => a.exerciseId === exerciseId && a.correct);
  }

  // ------------------------------------------------------------ stats

  private weightedAccuracy(attempts: AttemptRecord[]): number | null {
    if (!attempts.length) return null;
    const now = this.now();
    const sorted = [...attempts].sort((a, b) => b.timestamp - a.timestamp);
    let wsum = 0;
    let ssum = 0;
    sorted.forEach((a, rank) => {
      const ageDays = Math.max(0, (now - a.timestamp) / DAY_MS);
      const w = Math.pow(0.5, ageDays / 14) * Math.pow(0.85, rank);
      wsum += w;
      ssum += w * score(a);
    });
    return wsum > 0 ? ssum / wsum : null;
  }

  topicStats(topic: Topic): TopicStats {
    const as = this.getAttempts({ topic }).sort((a, b) => a.timestamp - b.timestamp);
    const n = as.length;
    const correct = as.filter((a) => a.correct).length;
    const partial = as.filter((a) => !a.correct && a.partial).length;
    return {
      topic,
      title: TOPIC_INFO[topic].title,
      attempts: n,
      correct,
      partial,
      accuracy: n ? as.reduce((s, a) => s + score(a), 0) / n : null,
      recentAccuracy: this.weightedAccuracy(as),
      lastPracticed: n ? as[n - 1].timestamp : undefined,
      averageTimeMs: n ? as.reduce((s, a) => s + a.timeMs, 0) / n : 0,
      hintsPerAttempt: n ? as.reduce((s, a) => s + a.hintsUsed, 0) / n : 0,
      level: adaptiveLevel(as),
    };
  }

  allTopicStats(): TopicStats[] {
    return TOPICS.map((t) => this.topicStats(t));
  }

  /** Adaptive difficulty for the next exercise in `topic`. */
  recommendedDifficulty(topic: Topic): Difficulty {
    return adaptiveLevel(this.getAttempts({ topic }).sort((a, b) => a.timestamp - b.timestamp));
  }

  streak(): StreakInfo {
    const days = new Set(this.data.attempts.map((a) => dayKey(a.timestamp)));
    if (!days.size) return { current: 0, longest: 0, practicedToday: false };
    const today = dayKey(this.now());
    const practicedToday = days.has(today);
    let current = 0;
    let d = practicedToday ? today : shiftDay(today, -1);
    while (days.has(d)) {
      current++;
      d = shiftDay(d, -1);
    }
    const sorted = [...days].sort();
    let longest = 0;
    let run = 0;
    let prev: string | null = null;
    for (const k of sorted) {
      run = prev !== null && shiftDay(prev, 1) === k ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = k;
    }
    return { current, longest, practicedToday, lastPracticeDay: sorted[sorted.length - 1] };
  }

  /**
   * Topics with at least `minAttempts` attempts whose recency-weighted
   * accuracy is below `threshold`, weakest first.
   */
  weakAreas(limit = 3, { minAttempts = 3, threshold = 0.75 } = {}): WeakArea[] {
    const out: WeakArea[] = [];
    for (const t of TOPICS) {
      const as = this.getAttempts({ topic: t });
      if (as.length < minAttempts) continue;
      const acc = this.weightedAccuracy(as)!;
      if (acc >= threshold) continue;
      out.push({
        topic: t,
        accuracy: acc,
        attempts: as.length,
        reason: `${Math.round(acc * 100)}% recent accuracy in ${TOPIC_INFO[t].title.toLowerCase()} over ${as.length} attempts.`,
      });
    }
    return out.sort((a, b) => a.accuracy - b.accuracy).slice(0, limit);
  }

  /** What to practise next: weak areas first, then new topics, then spaced review. */
  recommendNext(): Recommendation {
    if (!this.data.attempts.length) {
      return { topic: TOPICS[0], difficulty: 1, kind: 'start', reason: 'Start with the building blocks: recognising well-formed formulas.' };
    }
    const weak = this.weakAreas(1)[0];
    if (weak) {
      const d = this.recommendedDifficulty(weak.topic);
      return { topic: weak.topic, difficulty: d, kind: 'weak-area', reason: `${weak.reason} A few more at level ${d} will help.` };
    }
    const stats = this.allTopicStats();
    const fresh = stats.find((s) => s.attempts < 5);
    if (fresh) {
      return {
        topic: fresh.topic,
        difficulty: fresh.level,
        kind: 'new-topic',
        reason: fresh.attempts ? `Keep going with ${fresh.title.toLowerCase()} — you have only tried ${fresh.attempts}.` : `Next up: ${fresh.title.toLowerCase()}.`,
      };
    }
    const stale = [...stats].sort((a, b) => (a.lastPracticed ?? 0) - (b.lastPracticed ?? 0))[0];
    return { topic: stale.topic, difficulty: stale.level, kind: 'review', reason: `Time to review ${stale.title.toLowerCase()} (level ${stale.level}).` };
  }

  overview(recentLimit = 10): ProgressOverview {
    const as = this.data.attempts;
    return {
      totalAttempts: as.length,
      correct: as.filter((a) => a.correct).length,
      accuracy: as.length ? as.reduce((s, a) => s + score(a), 0) / as.length : null,
      streak: this.streak(),
      topics: this.allTopicStats(),
      weakAreas: this.weakAreas(),
      recommendation: this.recommendNext(),
      recentActivity: this.recentActivity(recentLimit),
    };
  }

  // ------------------------------------------------------------ continue last exercise

  setLastExercise(exercise: Exercise, extra: { answerDraft?: Answer; hintsShown?: number; sessionId?: string } = {}): void {
    this.commit({ ...this.data, lastExercise: { exercise, savedAt: this.now(), ...extra } });
  }

  getLastExercise(): LastExerciseRecord | undefined {
    return this.data.lastExercise;
  }

  clearLastExercise(): void {
    if (this.data.lastExercise) this.commit({ ...this.data, lastExercise: undefined });
  }

  // ------------------------------------------------------------ saved proofs

  saveProof(p: { id: string; title: string; draft: DerivationDraft; status?: ProofStatus; exerciseId?: string }): ProofDraftRecord {
    const now = this.now();
    const existing = this.data.proofs.find((x) => x.id === p.id);
    const rec: ProofDraftRecord = {
      id: p.id,
      title: p.title,
      draft: p.draft,
      status: p.status ?? existing?.status ?? 'in-progress',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(p.exerciseId ?? existing?.exerciseId ? { exerciseId: p.exerciseId ?? existing?.exerciseId } : {}),
    };
    const others = this.data.proofs.filter((x) => x.id !== p.id);
    const proofs = [rec, ...others].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, this.maxProofs);
    this.commit({ ...this.data, proofs });
    return rec;
  }

  getProof(id: string): ProofDraftRecord | undefined {
    return this.data.proofs.find((p) => p.id === id);
  }

  /** Most recently edited first. */
  listProofs(limit = 20, status?: ProofStatus): ProofDraftRecord[] {
    return this.data.proofs
      .filter((p) => !status || p.status === status)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  deleteProof(id: string): void {
    if (this.data.proofs.some((p) => p.id === id)) this.commit({ ...this.data, proofs: this.data.proofs.filter((p) => p.id !== id) });
  }
}

/** Bring any stored shape up to the current schema. */
function migrate(x: unknown): { ok: true; data: ProgressData } | { ok: false; issue: Exclude<LoadIssue, null> } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, issue: 'corrupt' };
  const o = x as Record<string, unknown>;
  const version = o.version === undefined ? 0 : o.version;
  if (typeof version !== 'number') return { ok: false, issue: 'corrupt' };
  if (version > PROGRESS_SCHEMA_VERSION) return { ok: false, issue: 'unsupported-version' };
  // v0 (unversioned): { attempts: [...] } only.
  const attempts = (Array.isArray(o.attempts) ? o.attempts : []).map(sanitizeAttempt).filter((a): a is AttemptRecord => a !== null);
  attempts.sort((a, b) => a.timestamp - b.timestamp);
  const proofs = (Array.isArray(o.proofs) ? o.proofs : []).map(sanitizeProof).filter((p): p is ProofDraftRecord => p !== null);
  return {
    ok: true,
    data: {
      version: PROGRESS_SCHEMA_VERSION,
      createdAt: isNum(o.createdAt) ? o.createdAt : attempts[0]?.timestamp ?? 0,
      attempts,
      proofs,
      lastExercise: sanitizeLast(o.lastExercise),
    },
  };
}
