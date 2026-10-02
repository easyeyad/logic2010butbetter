import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Horizontal scroll container with a visible affordance: edge shade on the
 * side(s) with hidden content and a "Scroll →" hint when it overflows.
 * `revealSelector` scrolls the first matching element into view on mount
 * (e.g. the first cell that still needs an answer).
 */
export function ScrollRegion({ label, children, revealSelector, className }: { label: string; children: ReactNode; revealSelector?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 2, right: max - el.scrollLeft > 2 });
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (revealSelector && el.scrollWidth > el.clientWidth) {
      const target = el.querySelector<HTMLElement>(revealSelector);
      const sticky = Array.from(el.querySelectorAll<HTMLElement>('thead .tt__atom')).reduce((w, th) => w + th.offsetWidth, 0);
      if (target && target.offsetLeft + target.offsetWidth > el.clientWidth) el.scrollLeft = Math.max(0, target.offsetLeft - sticky - 8);
    }
    measure();
  }, [revealSelector, measure]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  return (
    <div className={`scrollwrap ${edges.left ? 'has-left' : ''} ${edges.right ? 'has-right' : ''}`}>
      {(edges.left || edges.right) && (
        <p className="scrollwrap__hint" aria-hidden="true">
          <Icon name="arrowRight" size={14} /> Scroll sideways to see {edges.right ? 'more' : 'earlier'} columns
        </p>
      )}
      <div ref={ref} className={`tt-scroll ${className ?? ''}`} tabIndex={0} role="region" aria-label={`${label} (scrolls horizontally)`} onScroll={measure}>
        {children}
      </div>
    </div>
  );
}
