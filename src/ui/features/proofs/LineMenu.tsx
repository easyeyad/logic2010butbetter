import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '../../components/Icon';

export interface MenuAction {
  key: string;
  label: string;
  icon: IconName;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
  separatorBefore?: boolean;
}

/** Overflow ("⋯") menu for a proof line: arrow-key navigation, Escape closes. */
export function LineMenu({ actions, label }: { actions: MenuAction[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    items?.[0]?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = () => {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      setUp(r.bottom > window.innerHeight - 380);
    }
    setOpen((o) => !o);
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    }
    // Keep line-level shortcuts from firing while in the menu.
    e.stopPropagation();
  };

  return (
    <div className="menu-wrap">
      <button
        ref={btn}
        type="button"
        className="line__iconbtn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={toggle}
      >
        <Icon name="moreVertical" size={18} />
      </button>
      {open && (
        <ul id={id} ref={menu} role="menu" aria-label={label} className={`menu ${up ? 'menu--up' : ''}`} onKeyDown={onMenuKey}>
          {actions.map((a) => (
            <li key={a.key} role="none">
              {a.separatorBefore && <div className="menu__sep" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={`menu__item ${a.danger ? 'menu__item--danger' : ''}`}
                disabled={a.disabled}
                onClick={() => {
                  setOpen(false);
                  a.run();
                }}
              >
                <Icon name={a.icon} />
                <span>{a.label}</span>
                {a.kbd && <span className="menu__kbd">{a.kbd}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
