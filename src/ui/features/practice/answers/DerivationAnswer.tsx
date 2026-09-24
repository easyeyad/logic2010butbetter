import { useEffect, useRef } from 'react';
import { createDerivationDraft } from '../../../../learning';
import { FormulaTargetProvider, useFormulaTarget } from '../../../components/FormulaTarget';
import { SymbolBar } from '../../../components/SymbolBar';
import { BP, useMediaQuery } from '../../../hooks/useMediaQuery';
import { useFormulaFocus, useKeepFocusAboveBars } from '../../proofs/useFormulaFocus';
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

  const docked = !useMediaQuery(BP.desktop);
  const focused = useFormulaFocus('.practice-proof');
  const target = useFormulaTarget();
  useKeepFocusAboveBars('.practice-proof', docked);

  return (
    <div className="practice-proof">
      <ProofEditor ed={ed} inlineSymbolBar={!docked} />
      {docked && focused && (
        <div className="actionbar" role="region" aria-label="Proof tools">
          <SymbolBar compact label="Insert symbol into the focused line" onInsert={(d) => target?.insert(d)} />
        </div>
      )}
    </div>
  );
}

/** The full proof editor, seeded with the exercise's premises and Show line. */
export function DerivationAnswer(props: AnswerProps<'derivation'>) {
  return (
    <FormulaTargetProvider>
      <DerivationEditor {...props} />
    </FormulaTargetProvider>
  );
}
