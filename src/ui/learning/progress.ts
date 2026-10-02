/**
 * App-wide ProgressStore instance (browser storage) and a React hook over it.
 * All learning-analytics logic lives in src/learning; this only connects it.
 */
import { useSyncExternalStore } from 'react';
import { getDefaultStorage, ProgressStore, type ProgressData } from '../../learning';

let instance: ProgressStore | null = null;

export function progressStore(): ProgressStore {
  if (!instance) instance = new ProgressStore(getDefaultStorage());
  return instance;
}

/** Replace the store (tests). */
export function setProgressStore(s: ProgressStore | null) {
  instance = s;
}

/** Re-renders whenever progress data changes. Returns [store, snapshot]. */
export function useProgress(): [ProgressStore, ProgressData] {
  const store = progressStore();
  const snap = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
  return [store, snap];
}
