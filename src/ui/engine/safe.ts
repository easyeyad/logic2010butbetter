/**
 * Thin, crash-proof wrappers around the engine APIs. The UI never calls an
 * engine function directly from render code: any exception (including the
 * "not implemented" stubs during development) becomes a value the UI can show.
 */
import * as logic from '../../logic';
import * as proof from '../../proof';
import type { Formula, ParseResult, TruthTable, ValidityResult, Classification, Valuation } from '../../logic';
import type { DerivationCheck, DerivationDraft, DraftLine, RuleInfo } from '../../proof';

export type Safe<T> = { ok: true; value: T } | { ok: false; error: string };

export function attempt<T>(fn: () => T): Safe<T> {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Friendly text for an engine failure. */
export function engineErrorText(err: string): string {
  if (/not implemented/i.test(err)) return 'This part of the logic engine is still being built. Try again soon.';
  return `The logic engine hit a problem: ${err}`;
}

export function safeNormalize(text: string, caret: number): { text: string; caret: number } {
  const r = attempt(() => logic.normalizeInput(text, caret));
  return r.ok ? r.value : { text, caret };
}

export function safeParse(text: string): Safe<ParseResult> {
  return attempt(() => logic.parse(text));
}

export function safeFormat(f: Formula, ascii = false): string {
  const r = attempt(() => logic.format(f, { ascii }));
  return r.ok ? r.value : '?';
}

export function safeTruthTable(fs: Formula[]): Safe<TruthTable> {
  return attempt(() => logic.buildTruthTable(fs));
}

export function safeClassify(f: Formula): Safe<Classification> {
  return attempt(() => logic.classify(f));
}

export function safeEvaluate(f: Formula, v: Valuation): Safe<boolean> {
  return attempt(() => logic.evaluate(f, v));
}

export function safeValidity(premises: Formula[], conclusion: Formula): Safe<ValidityResult> {
  return attempt(() => logic.checkValidity(premises, conclusion));
}

export function safeAtoms(fs: Formula[]): string[] {
  const r = attempt(() => logic.atomsOf(...fs));
  return r.ok ? r.value : [];
}

export function safeCheckDerivation(draft: DerivationDraft): Safe<DerivationCheck> {
  return attempt(() => proof.checkDerivation(draft));
}

export type NextStep = ReturnType<typeof proof.suggestNextStep>;
export function safeSuggestNextStep(draft: DerivationDraft, level: 1 | 2 | 3): Safe<NextStep> {
  return attempt(() => proof.suggestNextStep(draft, level));
}

export type CloseSuggestion = ReturnType<typeof proof.suggestClose>;
export function safeSuggestClose(draft: DerivationDraft): CloseSuggestion {
  const r = attempt(() => proof.suggestClose(draft));
  return r.ok ? r.value : null;
}

export function ruleList(): RuleInfo[] {
  const r = attempt(() => proof.RULE_LIST);
  return r.ok && Array.isArray(r.value) ? r.value : [];
}

export function getRuleInfo(id: string): RuleInfo | undefined {
  const r = attempt(() => proof.getRule(id));
  return r.ok ? r.value : undefined;
}

/**
 * Full solution from the proof engine's bounded prover (premises/goal as text).
 * `available` is false when the engine doesn't export a solver.
 */
export const solverAvailable = typeof (proof as unknown as Record<string, unknown>).solve === 'function';
export function safeSolve(premises: string[], goal: string): Safe<DraftLine[] | null> {
  return attempt(() => {
    const ps = premises.filter((p) => p.trim()).map((p) => logic.parseOrThrow(p));
    const g = logic.parseOrThrow(goal);
    return proof.solve(ps, g);
  });
}
