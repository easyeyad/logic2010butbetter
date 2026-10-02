import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Tone = 'ok' | 'err' | 'warn' | 'info' | 'neutral';

const ICON: Record<Tone, IconName> = {
  ok: 'checkCircle',
  err: 'xCircle',
  warn: 'alert',
  info: 'info',
  neutral: 'info',
};

/** Status message: always icon + text (never color alone). */
export function Notice({
  tone = 'neutral',
  title,
  children,
  icon,
  role,
  className,
  actions,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: IconName;
  role?: 'status' | 'alert';
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={`notice notice--${tone} ${className ?? ''}`} role={role}>
      <Icon name={icon ?? ICON[tone]} />
      <div className="notice__body grow">
        {title && <div className="notice__title">{title}</div>}
        {children && <div>{children}</div>}
        {actions && <div className="row" style={{ marginTop: 'var(--sp-2)' }}>{actions}</div>}
      </div>
    </div>
  );
}

export function EngineError({ error }: { error: string }) {
  return (
    <Notice tone="warn" title="Engine unavailable" role="status">
      {/not implemented/i.test(error)
        ? 'This part of the logic engine is still being built. Your input is kept — try again soon.'
        : `The logic engine reported a problem: ${error}`}
    </Notice>
  );
}
