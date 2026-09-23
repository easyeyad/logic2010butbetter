import { useEffect, type ReactNode } from 'react';

/** Page title (h1) + description; also sets document.title. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Logic Studio`;
  }, [title]);
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 id="page-title" tabIndex={-1}>{title}</h1>
        {description && <p className="page-header__desc">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
