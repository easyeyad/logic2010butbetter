import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { CloseMethod, DerivationCheck, DerivationDraft, DraftLine, HintLine, LineCheck } from '../../../proof';
import { useSettings } from '../../app/settings';
import { safeCheckDerivation, type Safe } from '../../engine/safe';
import { useDebounced } from '../../hooks/useDebounced';
import { readStored, writeStored } from '../../hooks/storage';
import { useUndoable } from '../../hooks/useUndoable';
import {
  applyJustKey,
  blankLine,
  closeAndContinue,
  makeId,
  containingOpenShow,
  deleteLine,
  depthAfter,
  insertLine,
  linesForProblem,
  moveLine,
  reopenShow,
  shiftDepth,
  trimTrailingBlank,
  isBlank,
  updateLine,
} from './draftOps';
import { DERIVATION_EXERCISES } from '../../../learning';

export interface ProofProblem {
  /** Sample id, or 'custom'. */
  id: string;
  title: string;
  premises: string[];
  goal: string;
}

export interface ProofDoc {
  problem: ProofProblem;
  lines: DraftLine[];
}

export const PROOF_STORAGE_KEY = 'proof-session';

export function problemFromExercise(id: string): ProofProblem {
  const s = DERIVATION_EXERCISES.find((p) => p.id === id) ?? DERIVATION_EXERCISES[0];
  return { id: s.id, title: s.title, premises: s.premises, goal: s.goal };
}

/** Stable id for saving a proof: the exercise id, or a hash of a custom problem. */
export function proofIdFor(p: ProofProblem): string {
  if (DERIVATION_EXERCISES.some((e) => e.id === p.id)) return p.id;
  const text = `${p.premises.join('|')}⊢${p.goal}`;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return `custom-${(h >>> 0).toString(36)}`;
}

export function docForProblem(problem: ProofProblem): ProofDoc {
  return { problem, lines: linesForProblem(problem.premises, problem.goal) };
}

export function loadStoredDoc(): ProofDoc {
  const stored = readStored<ProofDoc | null>(PROOF_STORAGE_KEY, null);
  if (stored && Array.isArray(stored.lines) && stored.problem) return stored;
  return docForProblem(problemFromExercise(DERIVATION_EXERCISES[0].id));
}

export type Field = 'formula' | 'rule' | 'refs';
interface FocusRequest {
  id: string;
  field: Field;
  caret?: 'start' | 'end';
}

export interface CloseRequest {
  index: number;
}

/**
 * All proof-editor state: the undoable document, live (debounced) checking,
 * focus requests and structural operations. Components stay presentational.
 */
export interface ProofEditorOptions {
  /** Initial document (defaults to the autosaved one). */
  initial?: () => ProofDoc;
  /** localStorage key for autosave; null disables autosave. */
  storageKey?: string | null;
  /** Force derived rules on (e.g. an exercise that allows them). Settings can also enable them. */
  allowDerived?: boolean;
}

export function useProofEditor(opts: ProofEditorOptions = {}) {
  const { settings } = useSettings();
  const storageKey = opts.storageKey === undefined ? PROOF_STORAGE_KEY : opts.storageKey;
  const allowDerived = settings.derivedRules || Boolean(opts.allowDerived);
  const history = useUndoable<ProofDoc>(opts.initial ?? loadStoredDoc);
  const setDoc = history.set;
  const doc = history.state;
  const lines = doc.lines;
  const [focusReq, setFocusReq] = useState<FocusRequest | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [closeReq, setCloseReq] = useState<CloseRequest | null>(null);

  /** What the engine sees (trailing blank lines trimmed). */
  const draft: DerivationDraft = useMemo(
    () => ({
      goal: doc.problem.goal || undefined,
      premises: doc.problem.premises.length ? doc.problem.premises : undefined,
      lines: trimTrailingBlank(lines),
      allowDerivedRules: allowDerived,
    }),
    [doc.problem.goal, doc.problem.premises, lines, allowDerived],
  );

  // Autosave (debounced).
  const saved = useDebounced(doc, 400);
  useEffect(() => {
    if (storageKey) writeStored(storageKey, saved);
  }, [saved, storageKey]);

  // Live checking, debounced ~120ms.
  const checkedDraft = useDebounced(draft, 120);
  const check: Safe<DerivationCheck> = useMemo(() => safeCheckDerivation(checkedDraft), [checkedDraft]);
  const byId = useMemo(() => {
    const m = new Map<string, LineCheck>();
    if (check.ok) check.value.lines.forEach((l) => m.set(l.id, l));
    return m;
  }, [check]);
  /** Line numbers some issue flags as a bad reference, with the citing line. */
  const badRefTargets = useMemo(() => {
    const m = new Map<number, number[]>();
    if (!check.ok) return m;
    for (const lc of check.value.lines)
      for (const iss of lc.issues)
        for (const r of iss.badRefs ?? []) m.set(r, [...(m.get(r) ?? []), lc.number]);
    return m;
  }, [check]);

  // Apply focus requests after render.
  useLayoutEffect(() => {
    if (!focusReq) return;
    const row = document.querySelector<HTMLElement>(`[data-line-id="${focusReq.id}"]`);
    const el = row?.querySelector<HTMLInputElement>(`[data-field="${focusReq.field}"]`) ?? row?.querySelector<HTMLInputElement>('[data-field="formula"]');
    if (el) {
      el.focus();
      if (focusReq.caret && typeof el.setSelectionRange === 'function') {
        const c = focusReq.caret === 'start' ? 0 : el.value.length;
        el.setSelectionRange(c, c);
      }
      row?.scrollIntoView?.({ block: 'nearest' });
    }
    setFocusReq(null);
  }, [focusReq]);

  const setLines = useCallback(
    (fn: (ls: DraftLine[]) => DraftLine[], coalesceKey?: string) =>
      setDoc((d) => {
        const next = fn(d.lines);
        return next === d.lines ? d : { ...d, lines: next };
      }, { coalesceKey }),
    [setDoc],
  );

  const indexOf = useCallback((id: string) => lines.findIndex((l) => l.id === id), [lines]);

  const focusLine = useCallback((id: string, field: Field = 'formula', caret?: 'start' | 'end') => setFocusReq({ id, field, caret }), []);

  const ops = useMemo(() => {
    const insertAfter = (index: number, patch: Partial<DraftLine> = {}) => {
      const line = blankLine(depthAfter(lines, index), patch);
      setLines((ls) => insertLine(ls, index, { ...line, depth: patch.depth ?? depthAfter(ls, index) }).lines);
      setFocusReq({ id: line.id, field: 'formula' });
      return line.id;
    };
    return {
      insertAfter,
      insertShowAfter: (index: number) => insertAfter(index, { kind: 'show' }),
      insertAssumptionAfter: (index: number) => {
        // An assumption belongs directly under a show line: prefer CD when the show is a conditional.
        const target = lines[index];
        const kind: 'CD' | 'ID' = target?.kind === 'show' && /→|->/.test(target.text) ? 'CD' : 'ID';
        return insertAfter(index, { kind: 'assumption', assumption: kind });
      },
      updateText: (id: string, text: string) =>
        setLines((ls) => {
          const i = ls.findIndex((l) => l.id === id);
          return i < 0 || ls[i].text === text ? ls : updateLine(ls, i, { text });
        }, `text:${id}`),
      setJust: (id: string, key: string) =>
        setLines((ls) => {
          const i = ls.findIndex((l) => l.id === id);
          return i < 0 ? ls : updateLine(ls, i, applyJustKey(ls[i], key));
        }),
      setRefs: (id: string, refs: number[]) =>
        setLines((ls) => {
          const i = ls.findIndex((l) => l.id === id);
          return i < 0 ? ls : updateLine(ls, i, { refs });
        }, `refs:${id}`),
      toggleShow: (id: string) =>
        setLines((ls) => {
          const i = ls.findIndex((l) => l.id === id);
          if (i < 0) return ls;
          return updateLine(ls, i, ls[i].kind === 'show' ? { kind: 'step', close: undefined } : { kind: 'show', rule: undefined, refs: undefined, assumption: undefined });
        }),
      remove: (id: string) => {
        const i = indexOf(id);
        if (i < 0 || lines.length <= 1) return false;
        setLines((ls) => deleteLine(ls, i));
        const neighbour = lines[i - 1] ?? lines[i + 1];
        if (neighbour) setFocusReq({ id: neighbour.id, field: 'formula', caret: 'end' });
        return true;
      },
      move: (id: string, dir: -1 | 1) => {
        const i = indexOf(id);
        if (i < 0) return;
        setLines((ls) => moveLine(ls, i, dir).lines);
        setFocusReq({ id, field: 'formula' });
      },
      indent: (id: string, delta: -1 | 1) => {
        const i = indexOf(id);
        if (i >= 0) setLines((ls) => shiftDepth(ls, i, delta));
      },
      requestClose: (id: string) => {
        const i = indexOf(id);
        if (i < 0) return;
        const target = lines[i].kind === 'show' && !lines[i].close ? i : containingOpenShow(lines, i);
        if (target >= 0) setCloseReq({ index: target });
      },
      close: (index: number, method: CloseMethod, refs: number[]) => {
        setCloseReq(null);
        if (lines[index]?.kind !== 'show') return;
        const r = closeAndContinue(lines, index, method, refs);
        setLines(() => r.lines);
        setFocusReq({ id: r.focusId, field: 'formula' });
      },
      reopen: (id: string) => {
        const i = indexOf(id);
        if (i >= 0) setLines((ls) => reopenShow(ls, i));
      },
      appendLine: (patch: Partial<DraftLine>) => insertAfter(lines.length - 1, patch),
      /** Apply a level-3 hint line: close a box, or write the suggested line at the end. */
      applyHint: (h: HintLine) => {
        const rule = h.rule ?? '';
        if (h.kind === 'close' || ((rule === 'DD' || rule === 'CD' || rule === 'ID') && h.closeLine)) {
          const idx = (h.closeLine ?? 0) - 1;
          if (lines[idx]?.kind === 'show') {
            const r = closeAndContinue(lines, idx, rule as CloseMethod, h.refs ?? []);
            setLines(() => r.lines);
            setFocusReq({ id: r.focusId, field: 'formula' });
          }
          return;
        }
        const patch: Partial<DraftLine> =
          h.kind === 'show' || /^show$/i.test(rule)
            ? { kind: 'show', text: h.text }
            : h.kind === 'assumption' || /^ASS/.test(rule)
              ? { kind: 'assumption', assumption: /ID/.test(rule) ? 'ID' : 'CD', text: h.text }
              : { kind: 'step', text: h.text, rule: (rule || undefined) as DraftLine['rule'], refs: h.refs };
        // Fill the trailing blank line if there is one; otherwise append.
        let last = lines.length - 1;
        while (last > 0 && isBlank(lines[last]) && isBlank(lines[last - 1])) last--;
        const target = lines[last];
        const depth = h.depth ?? (target && isBlank(target) ? target.depth : depthAfter(lines, lines.length - 1));
        if (target && isBlank(target)) {
          setLines((ls) => updateLine(ls, last, { ...patch, depth }));
          setFocusReq({ id: target.id, field: 'formula', caret: 'end' });
        } else {
          insertAfter(lines.length - 1, { ...patch, depth });
        }
      },
    };
  }, [lines, setLines, indexOf]);

  const loadProblem = useCallback(
    (problem: ProofProblem) => {
      setDoc(docForProblem(problem));
      setFocusReq(null);
    },
    [setDoc],
  );

  const loadDocument = useCallback((d: ProofDoc) => {
    setDoc(d);
    setFocusReq(null);
  }, [setDoc]);

  const replaceLines = useCallback(
    (next: DraftLine[]) => setDoc((d) => ({ ...d, lines: next.map((l) => ({ ...l, id: makeId() })) })),
    [setDoc],
  );

  return {
    allowDerived,
    doc,
    lines,
    draft,
    check,
    byId,
    badRefTargets,
    ops,
    focusLine,
    focusedId,
    setFocusedId,
    closeReq,
    setCloseReq,
    loadProblem,
    loadDocument,
    replaceLines,
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  };
}

export type ProofEditorState = ReturnType<typeof useProofEditor>;
