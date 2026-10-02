import { useCallback, useState } from 'react';
import { readStored, writeStored } from './storage';

/** useState that persists (JSON) to localStorage under the app prefix. */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, initial));
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
        writeStored(key, next);
        return next;
      });
    },
    [key],
  );
  return [value, set];
}
