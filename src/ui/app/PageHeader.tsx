import { useEffect, useRef, type ReactNode } from 'react';
import { consumeHeadingFocus } from './headingFocus';

/** Page title (h1) + description; also sets document.title. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} · Logic Studio`;
  }, [title]);
  useEffect(() => consumeHeadingFocus(h1.current), []);
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 ref={h1} id="page-title" tabIndex={-1}>{title}</h1>
        {description && <p className="page-header__desc">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
