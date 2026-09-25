import { useEffect, useRef, useState } from 'react';
import type { Formula, ValidityResult } from '../../../logic';
import { useSearchParams } from 'react-router-dom';
import { checkPredicateArgument, type PredicateCheck } from '../../engine/predicateCheck';
import { PageHeader } from '../../app/PageHeader';
import { useSettings } from '../../app/settings';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FormulaInput } from '../../components/FormulaInput';
import { FormulaList } from '../../components/FormulaList';
import { Icon } from '../../components/Icon';
import { EngineError, Notice } from '../../components/Notice';
import { isPredicateInput, safeAtoms, safeParse, safeValidity } from '../../engine/safe';
import { PredicateVerdict } from './PredicateVerdict';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { CounterexampleTable, CountermodelView } from './CountermodelView';

type Outcome =
  | { kind: 'predicate'; result: PredicateCheck; premises: Formula[]; conclusion: Formula }
  | { kind: 'invalid-input'; message: string }
  | { kind: 'engine'; error: string }
  | { kind: 'done'; result: ValidityResult; premises: Formula[]; conclusion: Formula; atoms: string[] };

const EXAMPLES: { label: string; premises: string[]; conclusion: string }[] = [
  { label: 'Affirming the consequent', premises: ['P → Q', 'Q'], conclusion: 'P' },
  { label: 'Modus tollens', premises: ['P → Q', '¬Q'], conclusion: '¬P' },
  { label: 'Disjunctive syllogism?', premises: ['P ∨ Q', 'P'], conclusion: '¬Q' },
];

const PREDICATE_EXAMPLES: { label: string; premises: string[]; conclusion: string }[] = [
  { label: 'All F are G; a is G ∴ a is F', premises: ['∀x(Fx → Gx)', 'Ga'], conclusion: 'Fa' },
  { label: 'Some F, some G ∴ some F and G', premises: ['∃xFx', '∃xGx'], conclusion: '∃x(Fx ∧ Gx)' },
  { label: 'Quantifier shift ∀∃ ∴ ∃∀', premises: ['∀x∃yLxy'], conclusion: '∃y∀xLxy' },
  { label: 'All men are mortal', premises: ['∀x(Mx → Dx)', 'Ms'], conclusion: 'Ds' },
];

export default function CountermodelsPage() {
  const { settings } = useSettings();
  const [premises, setPremises] = useLocalStorage<string[]>('cm-premises', ['P → Q', 'Q']);
  const [conclusion, setConclusion] = useLocalStorage<string>('cm-conclusion', 'P');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [showAll, setShowAll] = useState(false);
  const verdictRef = useRef<HTMLElement>(null);
  // Fields at fault (arity conflicts, free variables): premise row indexes, and the conclusion.
  const [bad, setBad] = useState<{ rows: Set<number>; conclusion: boolean }>({ rows: new Set(), conclusion: false });
  const clearBad = () => setBad((b) => (b.rows.size || b.conclusion ? { rows: new Set(), conclusion: false } : b));

  // ?conclusion=… (e.g. from Truth Tables): test that sentence on its own.
  const [params, setParams] = useSearchParams();
  const fromParam = params.get('conclusion');
  useEffect(() => {
    if (!fromParam) return;
    const ps = (params.get('premises') ?? '').split('\n').filter((x) => x.trim());
    setPremises(ps.length ? ps : ['']);
    setConclusion(fromParam);
    setParams({}, { replace: true });
    setTimeout(() => run(ps, fromParam), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromParam]);

  // On stacked layouts, bring the verdict into view after checking.
  useEffect(() => {
    if (outcome && window.innerWidth < 1280) verdictRef.current?.scrollIntoView?.({ block: 'start' });
  }, [outcome]);

  const run = (ps = premises, c = conclusion) => {
    setShowAll(false);
    clearBad();
    const rowsOf: number[] = [];
    ps.forEach((p, i) => p.trim() && rowsOf.push(i));
    const texts = rowsOf.map((i) => ps[i].trim());
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
    if (isPredicateInput([...parsed, rc.value.formula])) {
      const pr = checkPredicateArgument(parsed, rc.value.formula, 4);
      if (pr.kind === 'input-problems') {
        const idx = pr.problems.flatMap((p) => p.inputs);
        setBad({ rows: new Set(idx.filter((i) => i < parsed.length).map((i) => rowsOf[i])), conclusion: idx.includes(parsed.length) });
      }
      return setOutcome({ kind: 'predicate', result: pr, premises: parsed, conclusion: rc.value.formula });
    }
    const res = safeValidity(parsed, rc.value.formula);
    if (!res.ok) return setOutcome({ kind: 'engine', error: res.error });
    setOutcome({ kind: 'done', result: res.value, premises: parsed, conclusion: rc.value.formula, atoms: safeAtoms([...parsed, rc.value.formula]) });
  };

  return (
    <div className="page">
      <PageHeader
        title="Countermodels"
        description="Is the argument valid? If not, see a countermodel: truth values (or, with quantifiers, a small world of objects) that make every premise true and the conclusion false."
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
              <FormulaList
                values={premises}
                onChange={(v) => {
                  clearBad();
                  setPremises(v);
                }}
                invalidRows={bad.rows} labelFor={(i) => `Premise ${i + 1}`} addLabel="Add premise" min={0} />
            </fieldset>
            <div className="concl">
              <span className="concl__therefore" aria-hidden="true">∴</span>
              <FormulaInput
                className="grow"
                label="Conclusion"
                value={conclusion}
                invalid={bad.conclusion}
                onChange={(t) => {
                  clearBad();
                  setConclusion(t);
                }}
              />
            </div>
            <Button type="submit" variant="primary" icon="scale">Check validity</Button>
          </form>
          {[
            { title: 'Sentential examples', list: EXAMPLES },
            { title: 'With quantifiers', list: PREDICATE_EXAMPLES },
          ].map((g) => (
            <div key={g.title} className="row">
              <span className="subtle">{g.title}:</span>
              {g.list.map((ex) => (
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
          ))}
        </section>

        <section ref={verdictRef} className="stack verdict-section" aria-label="Verdict" aria-live="polite">
          {!outcome && (
            <EmptyState icon="target" title="Test an argument">
              Enter premises and a conclusion, then press Check validity.
            </EmptyState>
          )}
          {outcome?.kind === 'invalid-input' && <Notice tone="warn" title="Check your input">{outcome.message}</Notice>}
          {outcome?.kind === 'engine' && <EngineError error={outcome.error} />}
          {outcome?.kind === 'predicate' && (
            <PredicateVerdict result={outcome.result} premises={outcome.premises} conclusion={outcome.conclusion} ascii={settings.asciiDisplay} />
          )}
          {outcome?.kind === 'done' && outcome.result.valid && (
            <div className="verdict-card verdict-card--valid">
              <h2 className="verdict-card__title"><Icon name="checkCircle" size={28} /> Valid</h2>
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
              <h2 className="verdict-card__title"><Icon name="xCircle" size={28} /> Invalid</h2>
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
