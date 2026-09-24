import { useState } from 'react';
import { Button } from '../../components/Button';
import { FormulaInput } from '../../components/FormulaInput';
import { FormulaText } from '../../components/FormulaText';
import { DERIVATION_EXERCISES, type DerivationExercise } from '../../../learning';
import { Icon } from '../../components/Icon';
import { useProgress } from '../../learning/progress';
import type { ProofProblem } from './useProofEditor';

function Sequent({ premises, goal }: { premises: string[]; goal: string }) {
  return (
    <span className="sequent">
      <FormulaText text={premises.length ? premises.join(', ') : '(no premises)'} />
      <span className="sequent__turn" aria-label="therefore"> ⊢ </span>
      <FormulaText text={goal || '…'} />
    </span>
  );
}

function CustomProblemForm({ onStart }: { onStart: (p: ProofProblem) => void }) {
  const [premises, setPremises] = useState<string[]>(['']);
  const [goal, setGoal] = useState('');
  return (
    <form
      className="stack stack--sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!goal.trim()) return;
        onStart({ id: 'custom', title: 'Your problem', premises: premises.filter((p) => p.trim()), goal });
      }}
    >
      {premises.map((p, i) => (
        <div key={i} className="row row--top">
          <FormulaInput
            className="grow"
            label={`Premise ${i + 1}`}
            value={p}
            toolbar={false}
            onChange={(t) => setPremises((ps) => ps.map((x, j) => (j === i ? t : x)))}
          />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon="trash"
            label={`Remove premise ${i + 1}`}
            className="row__trail"
            onClick={() => setPremises((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : ['']))}
          />
        </div>
      ))}
      <Button size="sm" variant="ghost" icon="plus" onClick={() => setPremises((ps) => [...ps, ''])}>
        Add premise
      </Button>
      <FormulaInput label="Conclusion to show" value={goal} onChange={setGoal} placeholder="e.g. P -> R" />
      <Button type="submit" variant="primary" icon="play" disabled={!goal.trim()}>
        Start this proof
      </Button>
    </form>
  );
}

/** Problem statement + sample exercises + custom problem entry. */
export function ProblemPanel({
  problem,
  onLoad,
  collapsible,
}: {
  problem: ProofProblem;
  onLoad: (p: ProofProblem) => void;
  /** Mobile/tablet: render as a header card whose chooser expands on demand. */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  const [custom, setCustom] = useState(false);

  const chooser = (
    <div className="stack">
      <section aria-labelledby="samples-h">
        <h3 id="samples-h" className="panel-h">Exercises</h3>
        <ExerciseGroups
          currentId={problem.id}
          onPick={(s) => {
            onLoad({ id: s.id, title: s.title, premises: s.premises, goal: s.goal });
            if (collapsible) setOpen(false);
          }}
        />
      </section>
      <section aria-labelledby="custom-h">
        <button type="button" className="disclosure" aria-expanded={custom} onClick={() => setCustom((c) => !c)}>
          <h3 id="custom-h" className="panel-h">Enter your own problem</h3>
          <span aria-hidden="true">{custom ? '−' : '+'}</span>
        </button>
        {custom && (
          <CustomProblemForm
            onStart={(p) => {
              onLoad(p);
              if (collapsible) setOpen(false);
            }}
          />
        )}
      </section>
    </div>
  );

  return (
    <div className={`problem ${collapsible ? 'problem--card' : ''}`}>
      <div className="problem__current">
        <div className="problem__label">Problem</div>
        <div className="problem__title">{problem.title}</div>
        <div className="problem__sequent">
          <Sequent premises={problem.premises} goal={problem.goal} />
        </div>
        {collapsible && (
          <Button size="sm" iconRight={open ? 'chevronUp' : 'chevronDown'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide exercises' : 'Change problem'}
          </Button>
        )}
      </div>
      {open && chooser}
    </div>
  );
}

const LEVELS = [1, 2, 3, 4, 5] as const;

/** DERIVATION_EXERCISES grouped by difficulty, with completion checkmarks. */
function ExerciseGroups({ currentId, onPick }: { currentId: string; onPick: (e: DerivationExercise) => void }) {
  const [store] = useProgress();
  const current = DERIVATION_EXERCISES.find((e) => e.id === currentId);
  return (
    <div className="levels">
      {LEVELS.map((lvl) => {
        const items = DERIVATION_EXERCISES.filter((e) => e.difficulty === lvl);
        if (!items.length) return null;
        const done = items.filter((e) => store.isSolved(e.id)).length;
        return (
          <details key={lvl} className="level" open={current ? current.difficulty === lvl : lvl === 1}>
            <summary className="level__summary">
              <span className="level__name">Level {lvl}</span>
              <span className="level__count">
                {done} of {items.length} done
              </span>
            </summary>
            <ul className="problem-list">
              {items.map((s) => {
                const solved = store.isSolved(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`problem-item ${currentId === s.id ? 'is-active' : ''}`}
                      aria-current={currentId === s.id ? 'true' : undefined}
                      onClick={() => onPick(s)}
                    >
                      <span className="problem-item__top">
                        <span className="problem-item__title">{s.title}</span>
                        <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                          {solved && (
                            <span className="badge badge--ok" title="Completed">
                              <Icon name="check" />
                              <span className="visually-hidden">Completed</span>
                            </span>
                          )}
                          <span className="badge">{s.strategy}</span>
                        </span>
                      </span>
                      <Sequent premises={s.premises} goal={s.goal} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
