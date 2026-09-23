import { useEffect, useRef, useState } from 'react';
import type { Formula, ValidityResult } from '../../../logic';
import { PageHeader } from '../../app/PageHeader';
import { useSettings } from '../../app/settings';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FormulaInput } from '../../components/FormulaInput';
import { FormulaList } from '../../components/FormulaList';
import { Icon } from '../../components/Icon';
import { EngineError, Notice } from '../../components/Notice';
import { safeAtoms, safeParse, safeValidity } from '../../engine/safe';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { CounterexampleTable, CountermodelView } from './CountermodelView';

type Outcome =
  | { kind: 'invalid-input'; message: string }
  | { kind: 'engine'; error: string }
  | { kind: 'done'; result: ValidityResult; premises: Formula[]; conclusion: Formula; atoms: string[] };

const EXAMPLES: { label: string; premises: string[]; conclusion: string }[] = [
  { label: 'Affirming the consequent', premises: ['P → Q', 'Q'], conclusion: 'P' },
  { label: 'Modus tollens', premises: ['P → Q', '¬Q'], conclusion: '¬P' },
  { label: 'Disjunctive syllogism?', premises: ['P ∨ Q', 'P'], conclusion: '¬Q' },
];

export default function CountermodelsPage() {
  const { settings } = useSettings();
  const [premises, setPremises] = useLocalStorage<string[]>('cm-premises', ['P → Q', 'Q']);
  const [conclusion, setConclusion] = useLocalStorage<string>('cm-conclusion', 'P');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [showAll, setShowAll] = useState(false);
  const verdictRef = useRef<HTMLElement>(null);

  // On stacked layouts, bring the verdict into view after checking.
  useEffect(() => {
    if (outcome && window.innerWidth < 1280) verdictRef.current?.scrollIntoView?.({ block: 'start' });
  }, [outcome]);

  const run = (ps = premises, c = conclusion) => {
    setShowAll(false);
    const texts = ps.map((p) => p.trim()).filter(Boolean);
    const parsed: Formula[] = [];
    for (const [i, t] of texts.entries()) {
      const r = safeParse(t);
      if (!r.ok) return setOutcome({ kind: 'engine', error: r.error });
      if (!r.value.ok) return setOutcome({ kind: 'invalid-input', message: `Premise ${i + 1} isn't well-formed: ${r.value.error.message}` });
      parsed.push(r.value.formula);
    }
    if (!c.trim()) return setOutcome({ kind: 'invalid-input', message: 'Enter a conclusion to test.' });
    const rc = safeParse(c);
    if (!rc.ok) return setOutcome({ kind: 'engine', error: rc.error });
    if (!rc.value.ok) return setOutcome({ kind: 'invalid-input', message: `The conclusion isn't well-formed: ${rc.value.error.message}` });
    const res = safeValidity(parsed, rc.value.formula);
    if (!res.ok) return setOutcome({ kind: 'engine', error: res.error });
    setOutcome({ kind: 'done', result: res.value, premises: parsed, conclusion: rc.value.formula, atoms: safeAtoms([...parsed, rc.value.formula]) });
  };

  return (
    <div className="page">
      <PageHeader
        title="Countermodels"
        description="Is the argument valid? If not, see an assignment of truth values that makes every premise true and the conclusion false."
      />
      <div className="cm-layout">
        <section className="card stack" aria-labelledby="cm-arg-h">
          <h2 id="cm-arg-h" className="card__title">Argument</h2>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            <fieldset className="plain-fieldset">
              <legend className="field__label">Premises</legend>
              <FormulaList values={premises} onChange={setPremises} labelFor={(i) => `Premise ${i + 1}`} addLabel="Add premise" min={0} />
            </fieldset>
            <div className="concl">
              <span className="concl__therefore" aria-hidden="true">∴</span>
              <FormulaInput className="grow" label="Conclusion" value={conclusion} onChange={setConclusion} />
            </div>
            <Button type="submit" variant="primary" icon="scale">Check validity</Button>
          </form>
          <div className="row">
            <span className="subtle">Examples:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className="chip"
                onClick={() => {
                  setPremises(ex.premises);
                  setConclusion(ex.conclusion);
                  run(ex.premises, ex.conclusion);
                }}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </section>

        <section ref={verdictRef} className="stack verdict-section" aria-label="Verdict" aria-live="polite">
          {!outcome && (
            <EmptyState icon="target" title="Test an argument">
              Enter premises and a conclusion, then press Check validity.
            </EmptyState>
          )}
          {outcome?.kind === 'invalid-input' && <Notice tone="warn" title="Check your input">{outcome.message}</Notice>}
          {outcome?.kind === 'engine' && <EngineError error={outcome.error} />}
          {outcome?.kind === 'done' && outcome.result.valid && (
            <div className="verdict-card verdict-card--valid">
              <div className="verdict-card__title"><Icon name="checkCircle" size={28} /> Valid</div>
              <p>
                No row makes all the premises true and the conclusion false; checked {outcome.result.rowsChecked} row
                {outcome.result.rowsChecked === 1 ? '' : 's'}.
              </p>
              {outcome.result.premisesInconsistent && (
                <Notice tone="info">
                  The premises can never all be true together, so the argument is valid vacuously — no row can make them all true.
                </Notice>
              )}
            </div>
          )}
          {outcome?.kind === 'done' && !outcome.result.valid && outcome.result.counterexample && (
            <div className="verdict-card verdict-card--invalid">
              <div className="verdict-card__title"><Icon name="xCircle" size={28} /> Invalid</div>
              <p className="subtle">
                {outcome.result.counterexamples.length} of {outcome.result.rowsChecked} rows {outcome.result.counterexamples.length === 1 ? 'is a counterexample' : 'are counterexamples'}. Here is one:
              </p>
              <CountermodelView
                atoms={outcome.atoms.length ? outcome.atoms : Object.keys(outcome.result.counterexample)}
                valuation={outcome.result.counterexample}
                premises={outcome.premises}
                conclusion={outcome.conclusion}
                ascii={settings.asciiDisplay}
              />
              {outcome.result.counterexamples.length > 1 && (
                <div className="stack stack--sm">
                  <Button size="sm" iconRight={showAll ? 'chevronUp' : 'chevronDown'} aria-expanded={showAll} onClick={() => setShowAll((s) => !s)}>
                    {showAll ? 'Hide' : 'Show'} all {outcome.result.counterexamples.length} counterexample rows
                  </Button>
                  {showAll && (
                    <CounterexampleTable
                      atoms={outcome.atoms.length ? outcome.atoms : Object.keys(outcome.result.counterexample)}
                      rows={outcome.result.counterexamples}
                      premises={outcome.premises}
                      conclusion={outcome.conclusion}
                      ascii={settings.asciiDisplay}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
