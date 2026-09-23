import type { TruthTable } from '../../../logic';
import { FormulaText } from '../../components/FormulaText';
import { safeClassify } from '../../engine/safe';
import { ClassificationBadge, explainClassification } from './ClassificationBadge';

/** One verdict per main formula: badge (icon + word) and an explanation. */
export function Classifications({ table }: { table: TruthTable }) {
  const mains = table.columns.map((c, i) => ({ c, i })).filter((x) => x.c.isMain);
  return (
    <ul className="verdicts">
      {mains.map(({ c, i }) => {
        const cls = safeClassify(c.formula);
        const trueRows = table.rows.filter((r) => r[i]).length;
        return (
          <li key={i} className="verdict">
            <div className="verdict__head">
              <FormulaText text={c.label} className="verdict__f" />
              {cls.ok && <ClassificationBadge c={cls.value} />}
            </div>
            {cls.ok && <p className="subtle">{explainClassification(cls.value, trueRows, table.rows.length)}</p>}
          </li>
        );
      })}
    </ul>
  );
}
