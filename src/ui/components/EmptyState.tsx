import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function EmptyState({
  icon,
  title,
  children,
  bullets,
  actions,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  bullets?: string[];
  actions?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <span className="empty-state__icon"><Icon name={icon} /></span>
      <h2>{title}</h2>
      {children && <p className="muted" style={{ maxWidth: '52ch' }}>{children}</p>}
      {bullets && (
        <ul>
          {bullets.map((b) => (
            <li key={b}>
              <Icon name="check" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {actions && <div className="row" style={{ justifyContent: 'center' }}>{actions}</div>}
    </section>
  );
}
