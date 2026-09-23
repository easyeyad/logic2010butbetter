import { useSyncExternalStore } from 'react';

function subscribe(query: string, cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(query);
  mql.addEventListener?.('change', cb);
  return () => mql.removeEventListener?.('change', cb);
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => subscribe(query, cb),
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** Layout breakpoints shared by the shell and the proof page. */
export const BP = {
  mobile: '(max-width: 767px)',
  desktop: '(min-width: 1024px)',
  wide: '(min-width: 1280px)',
} as const;
