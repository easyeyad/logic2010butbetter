import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { SymbolDef } from './symbols';

/**
 * Lets one shared SymbolBar (e.g. in the proof editor) insert into whichever
 * FormulaInput last had focus.
 */
export interface FormulaTargetApi {
  register: (insert: (def: SymbolDef) => void) => void;
  insert: (def: SymbolDef) => boolean;
}

const Ctx = createContext<FormulaTargetApi | null>(null);

export function useFormulaTarget() {
  return useContext(Ctx);
}

export function FormulaTargetProvider({ children }: { children: ReactNode }) {
  const current = useRef<((def: SymbolDef) => void) | null>(null);
  const api = useMemo<FormulaTargetApi>(
    () => ({
      register: (fn) => {
        current.current = fn;
      },
      insert: (def) => {
        if (!current.current) return false;
        current.current(def);
        return true;
      },
    }),
    [],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
