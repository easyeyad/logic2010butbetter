import { useCallback, useRef, useState } from 'react';

interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface SetOptions {
  /**
   * Consecutive sets with the same key (within `coalesceMs`) merge into one
   * undo step — used so typing in one field is a single undo.
   */
  coalesceKey?: string;
}

export interface Undoable<T> {
  state: T;
  set: (next: T | ((prev: T) => T), opts?: SetOptions) => void;
  undo: () => void;
  redo: () => void;
  reset: (next: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

const LIMIT = 200;

export function useUndoable<T>(initial: T | (() => T), coalesceMs = 1000): Undoable<T> {
  const [h, setH] = useState<History<T>>(() => ({
    past: [],
    present: typeof initial === 'function' ? (initial as () => T)() : initial,
    future: [],
  }));
  const last = useRef<{ key?: string; at: number }>({ at: 0 });

  const set = useCallback(
    (next: T | ((prev: T) => T), opts?: SetOptions) => {
      const now = Date.now();
      const key = opts?.coalesceKey;
      const coalesce = key !== undefined && last.current.key === key && now - last.current.at < coalesceMs;
      last.current = { key, at: now };
      setH((cur) => {
        const value = typeof next === 'function' ? (next as (p: T) => T)(cur.present) : next;
        if (Object.is(value, cur.present)) return cur;
        if (coalesce && cur.past.length > 0) return { past: cur.past, present: value, future: [] };
        return { past: [...cur.past, cur.present].slice(-LIMIT), present: value, future: [] };
      });
    },
    [coalesceMs],
  );

  const undo = useCallback(() => {
    last.current = { at: 0 };
    setH((cur) => {
      if (cur.past.length === 0) return cur;
      const prev = cur.past[cur.past.length - 1];
      return { past: cur.past.slice(0, -1), present: prev, future: [cur.present, ...cur.future] };
    });
  }, []);

  const redo = useCallback(() => {
    last.current = { at: 0 };
    setH((cur) => {
      if (cur.future.length === 0) return cur;
      const [next, ...rest] = cur.future;
      return { past: [...cur.past, cur.present], present: next, future: rest };
    });
  }, []);

  const reset = useCallback((next: T) => {
    last.current = { at: 0 };
    setH({ past: [], present: next, future: [] });
  }, []);

  return { state: h.present, set, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
