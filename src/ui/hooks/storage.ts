/** Tolerant localStorage access (private mode / blocked storage never throws). */
export const STORAGE_PREFIX = 'logic-studio:';

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    if (value === undefined) window.localStorage.removeItem(STORAGE_PREFIX + key);
    else window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function clearAllStored(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
