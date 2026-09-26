import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SymbolDef } from './symbols';

/**
 * Lets one shared SymbolBar (proof editor, formula lists) insert into
 * whichever FormulaInput inside the provider last had focus, and name it.
 * Fields register with an owner token and unregister when they unmount, so
 * the bar can never write into a field that no longer exists.
 */
export interface FormulaTargetApi {
  register: (owner: object, insert: (def: SymbolDef) => void, label?: string) => void;
  unregister: (owner: object) => void;
  /** Update the label if `owner` is the current target (e.g. rows renumbered). */
  relabel: (owner: object, label: string) => void;
  insert: (def: SymbolDef) => boolean;
  /** Label of the field the bar currently targets (null when none). */
  activeLabel: string | null;
}

const Ctx = createContext<FormulaTargetApi | null>(null);

export function useFormulaTarget() {
  return useContext(Ctx);
}

export function FormulaTargetProvider({ children }: { children: ReactNode }) {
  const current = useRef<{ owner: object; insert: (def: SymbolDef) => void } | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const api = useMemo<FormulaTargetApi>(
    () => ({
      register: (owner, insert, label) => {
        current.current = { owner, insert };
        setActiveLabel(label ?? null);
      },
      unregister: (owner) => {
        if (current.current?.owner !== owner) return;
        current.current = null;
        setActiveLabel(null);
      },
      relabel: (owner, label) => {
        if (current.current?.owner === owner) setActiveLabel(label);
      },
      insert: (def) => {
        if (!current.current) return false;
        current.current.insert(def);
        return true;
      },
      activeLabel,
    }),
    [activeLabel],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
