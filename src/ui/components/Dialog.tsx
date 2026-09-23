import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Button } from './Button';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** Use role="alertdialog" for confirmations. */
  alert?: boolean;
}

/** Centered modal with focus trap, Escape to close and backdrop click. */
export function Dialog({ open, title, onClose, children, footer, alert }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="dialog"
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="dialog__head">
          <h2 id={titleId} className="dialog__title">{title}</h2>
          <Button variant="ghost" size="sm" iconOnly icon="x" label="Close dialog" onClick={onClose} />
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      alert
      footer={
        <>
          <Button onClick={onCancel} data-autofocus>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="muted">{message}</div>
    </Dialog>
  );
}
