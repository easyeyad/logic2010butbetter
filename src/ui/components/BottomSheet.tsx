import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Button } from './Button';

/**
 * Mobile bottom sheet: drag handle (drag down to close), focus trap, Escape
 * and backdrop to close.
 */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
  tall,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  tall?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  useFocusTrap(ref, open, onClose);
  if (!open) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current == null) return;
    setDrag(Math.max(0, e.clientY - start.current));
  };
  const onPointerUp = () => {
    if (start.current == null) return;
    start.current = null;
    if (drag > 90) onClose();
    setDrag(0);
  };

  return createPortal(
    <div className="overlay overlay--sheet" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`sheet ${tall ? 'sheet--tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet__handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden="true"
        >
          <span />
        </div>
        <div className="sheet__head">
          <h2 id={titleId} className="sheet__title">{title}</h2>
          <Button variant="ghost" size="sm" iconOnly icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
