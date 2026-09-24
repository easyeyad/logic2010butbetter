import { useEffect, useRef } from 'react';
import { createDerivationDraft } from '../../../../learning';
import { FormulaTargetProvider } from '../../../components/FormulaTarget';
import { attempt } from '../../../engine/safe';
import { blankLine, makeId } from '../../proofs/draftOps';
import { ProofEditor } from '../../proofs/ProofEditor';
import { useProofEditor, type ProofDoc } from '../../proofs/useProofEditor';
import type { AnswerProps } from './types';

function DerivationEditor({ exercise, initial, onChange, solution }: AnswerProps<'derivation'>) {
  const ed = useProofEditor({
    storageKey: null,
    allowDerived: exercise.allowDerivedRules,
    initial: (): ProofDoc => {
      const problem = { id: exercise.id, title: exercise.title, premises: exercise.premises, goal: exercise.goal };
      if (initial?.draft?.lines?.length) return { problem, lines: initial.draft.lines };
      const d = attempt(() => createDerivationDraft(exercise));
      const lines = d.ok ? d.value.lines.map((l) => ({ ...l, id: makeId() })) : [];
      return { problem, lines: [...lines, blankLine(1)] };
    },
  });

  useEffect(() => {
    onChange({ kind: 'derivation', draft: ed.draft });
  }, [ed.draft, onChange]);

  const loaded = useRef(false);
  const { replaceLines } = ed;
  useEffect(() => {
    if (solution?.derivation && !loaded.current) {
      loaded.current = true;
      replaceLines(solution.derivation.lines);
    }
  }, [solution, replaceLines]);

  return <ProofEditor ed={ed} />;
}

/** The full proof editor, seeded with the exercise's premises and Show line. */
export function DerivationAnswer(props: AnswerProps<'derivation'>) {
  return (
    <FormulaTargetProvider>
      <DerivationEditor {...props} />
    </FormulaTargetProvider>
  );
}
