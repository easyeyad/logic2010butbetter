import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SymbolDef } from './symbols';

/**
 * Lets one shared SymbolBar (proof editor, formula lists) insert into
 * whichever FormulaInput inside the provider last had focus, and name it.
 */
export interface FormulaTargetApi {
  register: (insert: (def: SymbolDef) => void, label?: string) => void;
  insert: (def: SymbolDef) => boolean;
  /** Label of the field the bar currently targets (null until one is focused). */
  activeLabel: string | null;
}

const Ctx = createContext<FormulaTargetApi | null>(null);

export function useFormulaTarget() {
  return useContext(Ctx);
}

export function FormulaTargetProvider({ children }: { children: ReactNode }) {
  const current = useRef<((def: SymbolDef) => void) | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const api = useMemo<FormulaTargetApi>(
    () => ({
      register: (fn, label) => {
        current.current = fn;
        if (label !== undefined) setActiveLabel(label);
      },
      insert: (def) => {
        if (!current.current) return false;
        current.current(def);
        return true;
      },
      activeLabel,
    }),
    [activeLabel],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
