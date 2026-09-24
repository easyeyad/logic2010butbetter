import { useEffect, useState } from 'react';

/**
 * True while a formula field inside `scope` has focus, or while focus is in
 * the docked symbol toolbar itself (keyboard users tabbing to it). Focus on
 * any other button — e.g. Feedback/Hints/Rules — does NOT count.
 */
export function useFormulaFocus(scope: string): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const update = () => {
      const el = document.activeElement as HTMLElement | null;
      setFocused(Boolean(el && (el.matches(`${scope} [data-field="formula"]`) || el.closest('.actionbar .symbar'))));
    };
    const onOut = () => setTimeout(update, 0);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', onOut);
    };
  }, [scope]);
  return focused;
}

/**
 * Keep the focused line field visible above fixed bottom bars (the action
 * bar and the mobile tab bar): scroll just enough when a field in `scope`
 * gains focus and would sit under them.
 */
export function useKeepFocusAboveBars(scope: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const fix = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.closest(scope)) return;
      const row = el.closest<HTMLElement>('[data-line-id]') ?? el;
      const bars = Array.from(document.querySelectorAll<HTMLElement>('.actionbar, .tabbar'));
      const coverTop = Math.min(window.innerHeight, ...bars.map((b) => b.getBoundingClientRect().top));
      const r = el.getBoundingClientRect();
      const rowR = row.getBoundingClientRect();
      const bottom = Math.max(r.bottom, Math.min(rowR.bottom, r.bottom + 60));
      if (bottom > coverTop - 8) window.scrollBy({ top: bottom - coverTop + 16 });
      else if (r.top < 8) window.scrollBy({ top: r.top - 16 });
    };
    // Twice: after focus, and after the action bar swaps content (its height changes).
    const onIn = () => {
      requestAnimationFrame(() => {
        fix();
        requestAnimationFrame(fix);
      });
    };
    document.addEventListener('focusin', onIn);
    return () => document.removeEventListener('focusin', onIn);
  }, [scope, enabled]);
}
