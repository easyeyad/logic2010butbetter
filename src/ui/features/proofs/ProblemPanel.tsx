import { useState } from 'react';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { safeAtoms, safeParse, safeValidity } from '../../engine/safe';
import { countermodelNarrative } from '../countermodels/narrative';
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

type Verdict = { kind: 'invalid'; text: string } | { kind: 'bad-input'; text: string } | null;

/** Is the entered argument valid? (Invalid arguments have no derivation.) */
function assess(premises: string[], goal: string): Verdict {
  const fs = [];
  for (const [i, p] of premises.entries()) {
    const r = safeParse(p);
    if (!r.ok) return null;
    if (!r.value.ok) return { kind: 'bad-input', text: `Premise ${i + 1} isn't well-formed yet.` };
    fs.push(r.value.formula);
  }
  const g = safeParse(goal);
  if (!g.ok) return null;
  if (!g.value.ok) return { kind: 'bad-input', text: "The conclusion isn't well-formed yet." };
  const v = safeValidity(fs, g.value.formula);
  if (!v.ok || v.value.valid || !v.value.counterexample) return null;
  const atoms = safeAtoms([...fs, g.value.formula]);
  const cm = v.value.counterexample;
  const assignment = atoms.map((a) => `${a} = ${cm[a] ? 'True' : 'False'}`).join(', ');
  return {
    kind: 'invalid',
    text: `Countermodel: ${assignment}. ${countermodelNarrative(atoms, cm, fs.length)} No derivation of this conclusion exists.`,
  };
}

function CustomProblemForm({ onStart }: { onStart: (p: ProofProblem) => void }) {
  const [premises, setPremises] = useState<string[]>(['']);
  const [goal, setGoal] = useState('');
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [confirmed, setConfirmed] = useState(false);
  const start = () => onStart({ id: 'custom', title: 'Your problem', premises: premises.filter((p) => p.trim()), goal });
  return (
    <form
      className="stack stack--sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!goal.trim()) return;
        const v = assess(premises.filter((p) => p.trim()), goal);
        if (v && !(v.kind === 'invalid' && confirmed)) {
          setVerdict(v);
          setConfirmed(v.kind === 'invalid');
          return;
        }
        start();
      }}
    >
      {premises.map((p, i) => (
        <div key={i} className="row row--top">
          <FormulaInput
            className="grow"
            label={`Premise ${i + 1}`}
            value={p}
            toolbar={false}
            onChange={(t) => {
              setVerdict(null);
              setConfirmed(false);
              setPremises((ps) => ps.map((x, j) => (j === i ? t : x)));
            }}
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
      <FormulaInput
        label="Conclusion to show"
        value={goal}
        onChange={(t) => {
          setVerdict(null);
          setConfirmed(false);
          setGoal(t);
        }}
        placeholder="e.g. P -> R"
      />
      {verdict?.kind === 'invalid' && (
        <Notice tone="err" role="alert" title="This argument is invalid — no derivation exists">
          {verdict.text}
        </Notice>
      )}
      {verdict?.kind === 'bad-input' && <Notice tone="warn" role="alert">{verdict.text}</Notice>}
      <Button type="submit" variant={verdict?.kind === 'invalid' ? 'danger' : 'primary'} icon="play" disabled={!goal.trim() || verdict?.kind === 'bad-input'}>
        {verdict?.kind === 'invalid' ? 'Start anyway' : 'Start this proof'}
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
      {[...LEVELS, 'q' as const].map((lvl) => {
        const quant = lvl === 'q';
        const items = DERIVATION_EXERCISES.filter((e) => (quant ? e.topic === 'quantifier-derivation' : e.topic !== 'quantifier-derivation' && e.difficulty === lvl));
        if (!items.length) return null;
        const done = items.filter((e) => store.isSolved(e.id)).length;
        return (
          <details
            key={lvl}
            className="level"
            open={current ? (quant ? current.topic === 'quantifier-derivation' : current.topic !== 'quantifier-derivation' && current.difficulty === lvl) : lvl === 1}
          >
            <summary className="level__summary">
              <span className="level__name">{quant ? 'Quantifiers (∀ ∃)' : `Level ${lvl}`}</span>
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
                            <span className="badge badge--ok">
                              <Icon name="check" />
                              Done
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
