import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * While `active`, keeps Tab focus inside `ref`, calls onEscape on Escape and
 * restores focus to the previously focused element when deactivated.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  const escRef = useRef(onEscape);
  useEffect(() => {
    escRef.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('inert'));
    // Focus the first autofocus target, else the container.
    const auto = node.querySelector<HTMLElement>('[data-autofocus]');
    (auto ?? focusables()[0] ?? node).focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (escRef.current) {
          e.stopPropagation();
          escRef.current();
        }
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
    }
    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [active, ref]);
}
