import { useEffect, useRef } from 'react';

/**
 * Calls `flush(latest)` when the component unmounts, the page is hidden
 * (tab switch, app backgrounded) or unloaded — so debounced saves never lose
 * the last edits.
 */
export function useFlushOnLeave<T>(value: T, flush: (v: T) => void) {
  const latest = useRef({ value, flush });
  useEffect(() => {
    latest.current = { value, flush };
  });
  useEffect(() => {
    const run = () => latest.current.flush(latest.current.value);
    const onVis = () => {
      if (document.visibilityState === 'hidden') run();
    };
    window.addEventListener('pagehide', run);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', run);
      document.removeEventListener('visibilitychange', onVis);
      run();
    };
  }, []);
}
