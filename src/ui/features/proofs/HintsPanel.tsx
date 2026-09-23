import { useState } from 'react';
import type { DerivationDraft, DraftLine, HintLine } from '../../../proof';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/Dialog';
import { FormulaText } from '../../components/FormulaText';
import { Icon } from '../../components/Icon';
import { EngineError, Notice } from '../../components/Notice';
import { safeSolve, safeSuggestNextStep, solverAvailable } from '../../engine/safe';
import { signature } from './draftOps';

interface HintEntry {
  level: 1 | 2 | 3;
  message: string;
  line?: HintLine;
}

const LEVEL_NAME = { 1: 'Strategy', 2: 'More specific', 3: 'Next line' } as const;

/**
 * Progressive hints (level 1 → 2 → 3) from suggestNextStep, and a separate,
 * confirmed "Show solution" when the engine offers a solver.
 */
export function HintsPanel({
  draft,
  premises,
  goal,
  onApply,
  onSolution,
}: {
  draft: DerivationDraft;
  premises: string[];
  goal: string;
  onApply: (line: HintLine) => void;
  onSolution: (lines: DraftLine[]) => void;
}) {
  const [hints, setHints] = useState<HintEntry[]>([]);
  const [sig, setSig] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [none, setNone] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [noSolution, setNoSolution] = useState(false);
  const currentSig = signature(draft.lines);
  const stale = hints.length > 0 && sig !== currentSig;
  const nextLevel = (stale ? 1 : Math.min(3, hints.length + 1)) as 1 | 2 | 3;
  const maxed = !stale && hints.length >= 3;

  const ask = () => {
    const r = safeSuggestNextStep(draft, nextLevel);
    setError(null);
    setNone(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (!r.value) {
      setNone(true);
      return;
    }
    const entry: HintEntry = { level: nextLevel, message: r.value.message, line: r.value.line };
    setHints((h) => (stale ? [entry] : [...h, entry]));
    setSig(currentSig);
  };

  return (
    <div className="stack">
      <p className="subtle">
        Hints get more specific each time: first a strategy, then a concrete plan, then the next line itself.
      </p>
      <div className="row">
        <Button variant="primary" icon="lightbulb" onClick={ask} disabled={maxed}>
          {hints.length === 0 || stale ? 'Get a hint' : maxed ? 'No more hints for this step' : `Hint level ${nextLevel}`}
        </Button>
      </div>
      {stale && <Notice tone="info">Your proof changed since these hints — the next hint starts fresh.</Notice>}
      {error && <EngineError error={error} />}
      {none && <Notice tone="neutral">No hint available right now. Check the Feedback tab for problems to fix first.</Notice>}
      {hints.length > 0 && (
        <ol className="hints">
          {hints.map((h, i) => (
            <li key={i} className={`hint ${stale ? 'is-stale' : ''}`}>
              <div className="hint__level">
                <Icon name="lightbulb" size={14} /> Level {h.level} · {LEVEL_NAME[h.level]}
              </div>
              <p>{h.message}</p>
              {h.line && (
                <div className="hint__line">
                  {h.line.kind === 'show' && <span className="line__show">Show</span>}
                  <FormulaText text={h.line.text} />
                  {h.line.rule && (
                    <span className="badge badge--accent">
                      {h.line.rule} {h.line.refs?.join(', ')}
                    </span>
                  )}
                  {!stale && (
                    <Button size="sm" icon={h.line.kind === 'close' ? 'boxClose' : 'plus'} onClick={() => onApply(h.line!)}>
                      {h.line.kind === 'close' ? `Close line ${h.line.closeLine}` : 'Insert this line'}
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {solverAvailable && goal.trim() && (
        <div className="solution-box">
          <p className="subtle">Stuck for good? You can reveal a complete solution. It replaces your current lines (you can undo).</p>
          <Button variant="danger" icon="eye" onClick={() => setConfirm(true)}>Show solution</Button>
          {noSolution && (
            <Notice tone="warn">
              No solution found — the conclusion may not follow from the premises, or the proof is too long for the automatic prover.
            </Notice>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title="Show the full solution?"
        message="You'll learn more by working through the hints first. The solution replaces your current lines — you can undo this."
        confirmLabel="Show solution"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          const r = safeSolve(premises, goal);
          if (!r.ok) setError(r.error);
          else if (r.value) onSolution(r.value);
          else setNoSolution(true);
        }}
      />
    </div>
  );
}
