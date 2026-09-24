import { useEffect, useRef } from 'react';
import { DERIVATION_EXERCISES } from '../../../learning';
import { useDebounced } from '../../hooks/useDebounced';
import { progressStore } from '../../learning/progress';
import { useFlushOnLeave } from '../../hooks/useFlushOnLeave';
import { proofIdFor, type ProofDoc, type ProofEditorState } from './useProofEditor';

function saveToList(doc: ProofDoc, complete: boolean) {
  const worked = doc.lines.some((l) => (l.kind === 'step' || l.kind === 'assumption') && l.text.trim() !== '');
  if (!worked) return;
  try {
    const store = progressStore();
    const id = proofIdFor(doc.problem);
    const prev = store.getProof(id);
    // Skip identical re-saves (the flush often repeats the last debounced save).
    if (prev && prev.status === (complete ? 'complete' : 'in-progress') && JSON.stringify(prev.draft.lines) === JSON.stringify(doc.lines)) return;
    store.saveProof({
      id,
      title: doc.problem.title,
      draft: { goal: doc.problem.goal, premises: doc.problem.premises, lines: doc.lines },
      status: complete ? 'complete' : 'in-progress',
      exerciseId: DERIVATION_EXERCISES.some((e) => e.id === doc.problem.id) ? doc.problem.id : undefined,
    });
  } catch {
    /* storage problems never break the editor */
  }
}

/**
 * Connects the Proofs page to the progress store: saves the proof (debounced,
 * once the student has written something), and records a derivation attempt
 * the first time the proof becomes complete. Returns counters to bump.
 */
export function useProofTracking(ed: ProofEditorState) {
  const problem = ed.doc.problem;
  const proofId = proofIdFor(problem);
  const started = useRef({ id: proofId, at: Date.now(), hints: 0, solution: false, recorded: false });
  if (started.current.id !== proofId) started.current = { id: proofId, at: Date.now(), hints: 0, solution: false, recorded: false };

  const complete = ed.check.ok && ed.check.value.complete;
  const hasWork = ed.lines.some((l) => (l.kind === 'step' || l.kind === 'assumption') && l.text.trim() !== '');

  // Save the draft to the proof list (debounced, and flushed when leaving the page).
  const saved = useDebounced(ed.doc, 800);
  useEffect(() => saveToList(saved, complete), [saved, complete]);
  useFlushOnLeave({ doc: ed.doc, complete }, (v) => saveToList(v.doc, v.complete));

  // Record a completed derivation once per problem load.
  useEffect(() => {
    const s = started.current;
    if (!complete || !hasWork || s.recorded) return;
    s.recorded = true;
    const ex = DERIVATION_EXERCISES.find((e) => e.id === problem.id);
    try {
      progressStore().recordAttempt({
        exerciseId: ex ? ex.id : proofId,
        topic: 'derivation',
        difficulty: ex ? ex.difficulty : 3,
        correct: true,
        hintsUsed: s.hints,
        timeMs: Date.now() - s.at,
        solutionViewed: s.solution,
      });
    } catch {
      /* ignore */
    }
  }, [complete, hasWork, problem.id, proofId]);

  return {
    hint: () => {
      started.current.hints += 1;
    },
    solutionViewed: () => {
      started.current.solution = true;
    },
  };
}
