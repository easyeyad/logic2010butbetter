import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Button } from './Button';

/** Right-side drawer (used for the proof side panel on mid-size screens). */
export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay overlay--drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="sheet__head">
          <h2 id={titleId} className="sheet__title">{title}</h2>
          <Button variant="ghost" size="sm" iconOnly icon="x" label="Close panel" onClick={onClose} />
        </div>
        <div className="drawer__body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
