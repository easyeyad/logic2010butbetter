import { useId, useRef, type ReactNode, type KeyboardEvent } from 'react';

export interface TabDef<K extends string> {
  key: K;
  label: string;
  badge?: ReactNode;
}

/** WAI-ARIA tabs with roving focus (arrow keys, Home/End). */
export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  label,
  children,
}: {
  tabs: TabDef<K>[];
  active: K;
  onChange: (k: K) => void;
  label: string;
  children: ReactNode;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].key);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={label}>
        {tabs.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${base}-tab-${t.key}`}
            aria-controls={`${base}-panel`}
            aria-selected={active === t.key}
            tabIndex={active === t.key ? 0 : -1}
            className="tabs__tab"
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
            {t.badge}
          </button>
        ))}
      </div>
      <div className="tabs__panel" role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`} tabIndex={0}>
        {children}
      </div>
    </div>
  );
}
