import {
  PROGRESS_SCHEMA_VERSION,
  ProgressStore,
  adaptiveLevel,
  createMemoryStorage,
  generateExercise,
  type AttemptRecord,
  type Difficulty,
  type KeyValueStorage,
  type Topic,
} from './index';

const KEY = 'logic-studio:progress';
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

function makeStore(start = at(2026, 3, 10), storage = createMemoryStorage()) {
  let now = start;
  const store = new ProgressStore(storage, { now: () => now });
  return {
    store,
    storage,
    setNow: (t: number) => (now = t),
    rec: (topic: Topic, correct: boolean, extra: Partial<AttemptRecord> = {}) =>
      store.recordAttempt({ exerciseId: `${topic}-${Math.random()}`, topic, difficulty: 1, correct, hintsUsed: 0, timeMs: 1000, ...extra }),
  };
}

describe('ProgressStore: attempts & stats', () => {
  it('records attempts and computes per-topic stats', () => {
    const { store, rec } = makeStore();
    rec('symbolization', true, { timeMs: 2000, hintsUsed: 1 });
    rec('symbolization', false, { timeMs: 4000 });
    rec('symbolization', false, { partial: true, timeMs: 3000, hintsUsed: 2 });
    rec('wff', true);
    const s = store.topicStats('symbolization');
    expect(s.attempts).toBe(3);
    expect(s.correct).toBe(1);
    expect(s.partial).toBe(1);
    expect(s.accuracy).toBeCloseTo(1.5 / 3);
    expect(s.averageTimeMs).toBe(3000);
    expect(s.hintsPerAttempt).toBe(1);
    expect(store.topicStats('derivation')).toMatchObject({ attempts: 0, accuracy: null, level: 1 });
    const o = store.overview();
    expect(o.totalAttempts).toBe(4);
    expect(o.correct).toBe(2);
    expect(o.topics).toHaveLength(13);
    expect(store.recentActivity(2).map((a) => a.topic)).toEqual(['wff', 'symbolization']);
  });

  it('persists to storage and reloads', () => {
    const { store, storage, rec } = makeStore();
    rec('validity', true);
    const again = new ProgressStore(storage);
    expect(again.getAttempts()).toHaveLength(1);
    expect(JSON.parse(storage.getItem(KEY)!).version).toBe(PROGRESS_SCHEMA_VERSION);
    expect(store.isSolved(again.getAttempts()[0].exerciseId)).toBe(true);
  });

  it('notifies subscribers and hands out a fresh snapshot per change', () => {
    const { store, rec } = makeStore();
    const fn = vi.fn();
    const unsub = store.subscribe(fn);
    const before = store.getSnapshot();
    rec('wff', true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(before);
    unsub();
    rec('wff', true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('caps the number of stored attempts', () => {
    let now = 0;
    const store = new ProgressStore(createMemoryStorage(), { now: () => ++now, maxAttempts: 5 });
    for (let i = 0; i < 8; i++) store.recordAttempt({ exerciseId: `e${i}`, topic: 'wff', difficulty: 1, correct: true, hintsUsed: 0, timeMs: 0 });
    expect(store.getAttempts().map((a) => a.exerciseId)).toEqual(['e3', 'e4', 'e5', 'e6', 'e7']);
  });
});

describe('ProgressStore: streaks & activity (fake clock)', () => {
  it('counts consecutive days, surviving until the end of the next day', () => {
    const { store, setNow, rec } = makeStore();
    expect(store.streak()).toEqual({ current: 0, longest: 0, practicedToday: false });
    for (const d of [1, 2, 3]) {
      setNow(at(2026, 3, d, 9));
      rec('wff', true);
      setNow(at(2026, 3, d, 21));
      rec('wff', true);
    }
    setNow(at(2026, 3, 3, 22));
    expect(store.streak()).toMatchObject({ current: 3, longest: 3, practicedToday: true, lastPracticeDay: '2026-03-03' });
    setNow(at(2026, 3, 4, 10)); // not yet practised today: streak still alive
    expect(store.streak()).toMatchObject({ current: 3, practicedToday: false });
    setNow(at(2026, 3, 5, 10)); // missed a whole day
    expect(store.streak()).toMatchObject({ current: 0, longest: 3 });
    rec('wff', true);
    expect(store.streak()).toMatchObject({ current: 1, longest: 3, practicedToday: true });
  });

  it('handles month boundaries', () => {
    const { store, setNow, rec } = makeStore();
    for (const [m, d] of [[1, 30], [1, 31], [2, 1]]) {
      setNow(at(2026, m, d));
      rec('wff', true);
    }
    expect(store.streak().current).toBe(3);
  });

  it('reports activity by day', () => {
    const { store, setNow, rec } = makeStore();
    setNow(at(2026, 3, 8));
    rec('wff', true);
    rec('wff', false);
    setNow(at(2026, 3, 10));
    rec('wff', true);
    const days = store.activityByDay(3);
    expect(days).toEqual([
      { date: '2026-03-08', attempts: 2, correct: 1 },
      { date: '2026-03-09', attempts: 0, correct: 0 },
      { date: '2026-03-10', attempts: 1, correct: 1 },
    ]);
  });
});

describe('ProgressStore: weak areas & recommendations', () => {
  it('finds weak areas (≥3 attempts, low recency-weighted accuracy), weakest first', () => {
    const { store, rec } = makeStore();
    for (let i = 0; i < 4; i++) rec('symbolization', i === 0);
    for (let i = 0; i < 4; i++) rec('validity', i < 2);
    rec('derivation', false);
    rec('derivation', false); // only 2 attempts: not enough evidence
    for (let i = 0; i < 5; i++) rec('wff', true);
    const weak = store.weakAreas();
    expect(weak.map((w) => w.topic)).toEqual(['symbolization', 'validity']);
    expect(weak[0].accuracy).toBeLessThan(weak[1].accuracy);
    expect(weak[0].reason).toMatch(/symbolization/);
  });

  it('weights recent attempts more heavily', () => {
    const { store, setNow, rec } = makeStore();
    // long ago: all wrong; recently: all right
    setNow(at(2026, 1, 1));
    for (let i = 0; i < 4; i++) rec('truth-table', false);
    setNow(at(2026, 3, 10));
    for (let i = 0; i < 3; i++) rec('truth-table', true);
    const s = store.topicStats('truth-table');
    expect(s.accuracy).toBeCloseTo(3 / 7);
    expect(s.recentAccuracy!).toBeGreaterThan(0.9);
    expect(store.weakAreas().map((w) => w.topic)).not.toContain('truth-table');
  });

  it('recommends: start → weak area → new topic → review', () => {
    const { store, setNow, rec } = makeStore();
    expect(store.recommendNext()).toMatchObject({ kind: 'start', topic: 'wff', difficulty: 1 });
    for (let i = 0; i < 3; i++) rec('symbolization', false);
    expect(store.recommendNext()).toMatchObject({ kind: 'weak-area', topic: 'symbolization' });
    for (let i = 0; i < 12; i++) rec('symbolization', true);
    expect(store.recommendNext()).toMatchObject({ kind: 'new-topic', topic: 'wff' });
    // practise everything
    let t = at(2026, 3, 11);
    for (const topic of ['wff', 'truth-table', 'validity', 'countermodel', 'inference-rule', 'derivation', 'terminology'] as Topic[]) {
      for (let i = 0; i < 5; i++) {
        setNow((t += 60_000));
        rec(topic, true);
      }
    }
    // sentential done → predicate logic comes next
    expect(store.recommendNext()).toMatchObject({ kind: 'new-topic', topic: 'predicate-symbolization' });
    for (const topic of ['predicate-symbolization', 'model', 'predicate-countermodel', 'quantifier-derivation', 'predicate-terminology'] as Topic[]) {
      for (let i = 0; i < 5; i++) {
        setNow((t += 60_000));
        rec(topic, true);
      }
    }
    const r = store.recommendNext();
    expect(r.kind).toBe('review');
    expect(r.topic).toBe('symbolization'); // least recently practised
  });
});

describe('adaptive difficulty', () => {
  const A = (correct: boolean, difficulty: Difficulty, extra: Partial<AttemptRecord> = {}): AttemptRecord => ({ exerciseId: 'x', topic: 'wff', difficulty, correct, hintsUsed: 0, timeMs: 0, timestamp: 0, ...extra });

  it('raises the level after three clean successes at the current level', () => {
    expect(adaptiveLevel([A(true, 1), A(true, 1)])).toBe(1);
    expect(adaptiveLevel([A(true, 1), A(true, 1), A(true, 1)])).toBe(2);
    expect(adaptiveLevel(Array.from({ length: 30 }, (_, i) => A(true, Math.min(5, 1 + Math.floor(i / 3)) as Difficulty)))).toBe(5);
  });

  it('does not count successes that relied on hints or the solution, or easier levels', () => {
    expect(adaptiveLevel([A(true, 1, { hintsUsed: 2 }), A(true, 1, { hintsUsed: 3 }), A(true, 1, { hintsUsed: 2 })])).toBe(1);
    expect(adaptiveLevel([A(true, 1), A(true, 1), A(true, 1), A(true, 1), A(true, 1), A(true, 1)])).toBe(2); // stays: level-1 items don't promote from 2
  });

  it('lowers the level after two failures in three attempts', () => {
    const up = [A(true, 1), A(true, 1), A(true, 1), A(true, 2), A(true, 2), A(true, 2)]; // → 3
    expect(adaptiveLevel(up)).toBe(3);
    expect(adaptiveLevel([...up, A(false, 3), A(true, 3), A(false, 3)])).toBe(2);
    expect(adaptiveLevel([A(false, 1), A(false, 1), A(false, 1)])).toBe(1);
  });

  it('the store exposes it per topic', () => {
    const { store, rec } = makeStore();
    for (let i = 0; i < 3; i++) rec('validity', true, { difficulty: 1 });
    expect(store.recommendedDifficulty('validity')).toBe(2);
    expect(store.topicStats('validity').level).toBe(2);
    expect(store.recommendedDifficulty('wff')).toBe(1);
  });
});

describe('ProgressStore: continue & proofs', () => {
  it('remembers the last exercise (with draft answer) and clears it once solved', () => {
    const { store, storage } = makeStore();
    const ex = generateExercise('symbolization', 2, 9);
    store.setLastExercise(ex, { answerDraft: { kind: 'symbolization', formula: 'R →' }, hintsShown: 1 });
    const reloaded = new ProgressStore(storage);
    expect(reloaded.getLastExercise()).toMatchObject({ exercise: ex, hintsShown: 1, answerDraft: { formula: 'R →' } });
    store.recordAttempt({ exerciseId: 'other', topic: 'wff', difficulty: 1, correct: true, hintsUsed: 0, timeMs: 0 });
    expect(store.getLastExercise()).toBeDefined();
    store.recordAttempt({ exerciseId: ex.id, topic: ex.topic, difficulty: ex.difficulty, correct: true, hintsUsed: 0, timeMs: 0 });
    expect(store.getLastExercise()).toBeUndefined();
  });

  it('saves, lists (most recent first), updates and deletes proof drafts', () => {
    const { store, setNow } = makeStore();
    const draft = { lines: [{ id: 'a', kind: 'premise' as const, text: 'P', depth: 0 }] };
    setNow(at(2026, 3, 10, 9));
    store.saveProof({ id: 'p1', title: 'MP chain', draft, exerciseId: 'der-01' });
    setNow(at(2026, 3, 10, 10));
    store.saveProof({ id: 'p2', title: 'Free proof', draft });
    expect(store.listProofs().map((p) => p.id)).toEqual(['p2', 'p1']);
    setNow(at(2026, 3, 10, 11));
    const up = store.saveProof({ id: 'p1', title: 'MP chain', draft, status: 'complete' });
    expect(up).toMatchObject({ exerciseId: 'der-01', status: 'complete', createdAt: at(2026, 3, 10, 9), updatedAt: at(2026, 3, 10, 11) });
    expect(store.listProofs().map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(store.listProofs(10, 'in-progress').map((p) => p.id)).toEqual(['p2']);
    store.deleteProof('p2');
    expect(store.getProof('p2')).toBeUndefined();
  });
});

describe('ProgressStore: resilience', () => {
  it('survives corrupt JSON: backs it up and starts fresh', () => {
    const storage = createMemoryStorage({ [KEY]: '{"version":1,"attempts":[{' });
    const store = new ProgressStore(storage);
    expect(store.loadIssue).toBe('corrupt');
    expect(store.getAttempts()).toEqual([]);
    expect(storage.getItem(`${KEY}:corrupt`)).toBe('{"version":1,"attempts":[{');
    store.recordAttempt({ exerciseId: 'e', topic: 'wff', difficulty: 1, correct: true, hintsUsed: 0, timeMs: 0 });
    expect(new ProgressStore(storage).getAttempts()).toHaveLength(1);
  });

  it('survives non-object JSON and unknown future versions', () => {
    for (const raw of ['null', '42', '"hi"', '[1,2]']) {
      const s = new ProgressStore(createMemoryStorage({ [KEY]: raw }));
      expect(s.loadIssue).toBe('corrupt');
      expect(s.getAttempts()).toEqual([]);
    }
    const future = new ProgressStore(createMemoryStorage({ [KEY]: JSON.stringify({ version: 99, attempts: [] }) }));
    expect(future.loadIssue).toBe('unsupported-version');
  });

  it('drops malformed records but keeps good ones; migrates unversioned data', () => {
    const good = { exerciseId: 'a', topic: 'wff', difficulty: 9, correct: true, hintsUsed: -1, timeMs: 'x', timestamp: 5 };
    const raw = JSON.stringify({
      attempts: [good, { topic: 'nope', correct: true, timestamp: 1 }, null, 'str', { exerciseId: 'b', topic: 'wff', correct: 'yes', timestamp: 1 }],
      proofs: [{ id: 'p', draft: { lines: [] } }, { id: 'bad' }],
      lastExercise: { exercise: { nope: true } },
    });
    const store = new ProgressStore(createMemoryStorage({ [KEY]: raw }));
    expect(store.loadIssue).toBeNull();
    expect(store.getAttempts()).toEqual([{ exerciseId: 'a', topic: 'wff', difficulty: 5, correct: true, hintsUsed: 0, timeMs: 0, timestamp: 5 }]);
    expect(store.listProofs().map((p) => p.id)).toEqual(['p']);
    expect(store.getLastExercise()).toBeUndefined();
  });

  it('keeps working in memory when storage throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    const store = new ProgressStore(broken);
    store.recordAttempt({ exerciseId: 'e', topic: 'wff', difficulty: 1, correct: true, hintsUsed: 0, timeMs: 0 });
    expect(store.getAttempts()).toHaveLength(1);
  });

  it('exports and imports; rejects bad imports without changing data', () => {
    const { store, rec } = makeStore();
    rec('wff', true);
    const json = store.exportData();
    const other = makeStore().store;
    expect(other.importData(json)).toBe(true);
    expect(other.getAttempts()).toHaveLength(1);
    expect(other.importData('not json')).toBe(false);
    expect(other.importData('{"version":42}')).toBe(false);
    expect(other.getAttempts()).toHaveLength(1);
    other.reset();
    expect(other.getAttempts()).toHaveLength(0);
  });
});
