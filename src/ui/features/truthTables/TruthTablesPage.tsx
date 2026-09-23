import { useMemo } from 'react';
import type { Formula } from '../../../logic';
import { PageHeader } from '../../app/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { FormulaList } from '../../components/FormulaList';
import { EngineError, Notice } from '../../components/Notice';
import { safeParse, safeTruthTable } from '../../engine/safe';
import { useDebounced } from '../../hooks/useDebounced';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { Classifications } from './Classifications';
import { PracticeTable } from './PracticeTable';
import { TruthTableView } from './TruthTableView';

type Mode = 'auto' | 'practice';
const EXAMPLES = ['(P ∧ Q) → R', '¬(P ∨ Q)', '(P → Q) ↔ (¬Q → ¬P)'];

export default function TruthTablesPage() {
  const [formulas, setFormulas] = useLocalStorage<string[]>('tt-formulas', ['']);
  const [mode, setMode] = useLocalStorage<Mode>('tt-mode', 'auto');
  const debounced = useDebounced(formulas, 200);

  const result = useMemo(() => {
    const texts = debounced.map((t) => t.trim()).filter(Boolean);
    if (texts.length === 0) return { kind: 'empty' as const };
    const parsed: Formula[] = [];
    for (const t of texts) {
      const r = safeParse(t);
      if (!r.ok) return { kind: 'engine' as const, error: r.error };
      if (!r.value.ok) return { kind: 'invalid' as const };
      parsed.push(r.value.formula);
    }
    const table = safeTruthTable(parsed);
    if (!table.ok) return { kind: 'engine' as const, error: table.error };
    return { kind: 'ok' as const, table: table.value, key: texts.join('|') };
  }, [debounced]);

  const caption = `Truth table for ${debounced.filter((t) => t.trim()).join(', ')}`;

  return (
    <div className="page">
      <PageHeader
        title="Truth Tables"
        description="Enter one or more formulas. See the full table with every subformula, or practice filling it in yourself."
      />
      <div className="tt-layout">
        <section className="card stack" aria-labelledby="tt-input-h">
          <div className="row row--between">
            <h2 id="tt-input-h" className="card__title" style={{ margin: 0 }}>Formulas</h2>
            <div className="segmented" role="group" aria-label="Mode">
              <button type="button" aria-pressed={mode === 'auto'} onClick={() => setMode('auto')}>Automatic</button>
              <button type="button" aria-pressed={mode === 'practice'} onClick={() => setMode('practice')}>Practice</button>
            </div>
          </div>
          <FormulaList values={formulas} onChange={setFormulas} labelFor={(i) => `Formula ${i + 1}`} />
          <div className="row">
            <span className="subtle">Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip math" onClick={() => setFormulas([ex])}>
                {ex}
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Result" className="stack">
          {result.kind === 'empty' && (
            <EmptyState icon="table" title="Your table will appear here">
              Type a formula above — ASCII works too: <code>(P &amp; Q) -&gt; R</code>. Separate several formulas with commas.
            </EmptyState>
          )}
          {result.kind === 'invalid' && (
            <Notice tone="warn" title="Fix the highlighted formula first">
              The table is built once every formula is well-formed.
            </Notice>
          )}
          {result.kind === 'engine' && <EngineError error={result.error} />}
          {result.kind === 'ok' &&
            (mode === 'auto' ? (
              <>
                <TruthTableView table={result.table} caption={caption} />
                <p className="subtle">
                  {result.table.rows.length} rows · {result.table.atoms.length} sentence letter{result.table.atoms.length === 1 ? '' : 's'}. The
                  main column{result.table.columns.filter((c) => c.isMain).length > 1 ? 's are' : ' is'} outlined.
                </p>
                <Classifications table={result.table} />
              </>
            ) : (
              <PracticeTable key={result.key} table={result.table} caption={caption} />
            ))}
        </section>
      </div>
    </div>
  );
}
