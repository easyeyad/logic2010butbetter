import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface ToastApi {
  show: (message: string, action?: ToastItem['action'], ms?: number) => void;
}

const Ctx = createContext<ToastApi>({ show: () => {} });

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi['show']>(
    (message, action, ms = 6000) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { id, message, action }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <Icon name="info" />
            <span className="grow">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast__close" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
