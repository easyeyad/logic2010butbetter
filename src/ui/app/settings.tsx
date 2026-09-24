import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export type ThemePref = 'system' | 'light' | 'dark';
export type MotionPref = 'system' | 'reduce' | 'full';

export interface Settings {
  theme: ThemePref;
  motion: MotionPref;
  /** Allow Logic 2010 derived rules (DM, NC, NB, CDJ, SC) in proofs. */
  derivedRules: boolean;
  /** Display formulas in ASCII (~ & v -> <->) rather than symbols. */
  asciiDisplay: boolean;
  /** Predicate logic: show quantifier buttons (∀ ∃, terms) and allow lowercase terms. */
  predicateMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  motion: 'system',
  derivedRules: false,
  asciiDisplay: false,
  predicateMode: true,
};

interface SettingsApi {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const Ctx = createContext<SettingsApi>({ settings: DEFAULT_SETTINGS, update: () => {} });

export function useSettings() {
  return useContext(Ctx);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalStorage<Settings>('settings', DEFAULT_SETTINGS);
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    if (settings.motion === 'system') root.removeAttribute('data-motion');
    else root.setAttribute('data-motion', settings.motion);
  }, [settings.theme, settings.motion]);

  const api = useMemo<SettingsApi>(
    () => ({ settings, update: (patch) => setStored((prev) => ({ ...DEFAULT_SETTINGS, ...prev, ...patch })) }),
    [settings, setStored],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
