import { useEffect, useState } from 'react';
import type { CloseMethod, DerivationDraft } from '../../../proof';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { FormulaText } from '../../components/FormulaText';
import { Icon } from '../../components/Icon';
import { getRuleInfo, safeSuggestClose } from '../../engine/safe';
import { formatRefs, parseRefs } from './draftOps';

const METHODS: { m: CloseMethod; name: string; fallback: string }[] = [
  { m: 'DD', name: 'Direct derivation', fallback: 'The formula you are showing appears on an earlier line inside the box.' },
  { m: 'CD', name: 'Conditional derivation', fallback: 'You assumed the antecedent (ASS CD) and derived the consequent inside the box.' },
  { m: 'ID', name: 'Indirect derivation', fallback: 'You assumed the opposite (ASS ID) and derived a formula and its negation inside the box.' },
  { m: 'UD', name: 'Universal derivation', fallback: 'To show ∀x φ: derive φ for a variable that is not free in any line the box depends on, then close with UD.' },
];

/** Choose DD/CD/ID and the cited lines to close a show line's box. */
export function CloseBoxDialog({
  open,
  index,
  draft,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  index: number;
  draft: DerivationDraft;
  onCancel: () => void;
  onConfirm: (method: CloseMethod, refs: number[]) => void;
}) {
  const line = draft.lines[index];
  const [method, setMethod] = useState<CloseMethod>('DD');
  const [refsText, setRefsText] = useState('');
  const [suggested, setSuggested] = useState(false);

  useEffect(() => {
    if (!open || !line) return;
    const s = safeSuggestClose(draft);
    if (s && s.showLine === index + 1) {
      setMethod(s.method);
      setRefsText(formatRefs(s.refs));
      setSuggested(true);
    } else {
      // Sensible default from the box's first line.
      const first = draft.lines[index + 1];
      setMethod(first?.kind === 'assumption' ? (first.assumption ?? 'CD') : 'DD');
      setRefsText('');
      setSuggested(false);
    }
    // Only when the dialog opens.
  }, [open, index]);

  if (!line) return null;
  const refs = parseRefs(refsText);
  const n = index + 1;

  return (
    <Dialog
      open={open}
      title={`Close the box for line ${n}`}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon="boxClose" disabled={refs === null} onClick={() => refs && onConfirm(method, refs)}>
            Close box
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (refs) onConfirm(method, refs);
        }}
      >
        <p className="muted">
          Show <FormulaText text={line.text || '…'} />
        </p>
        {suggested && (
          <div className="notice notice--info">
            <Icon name="lightbulb" />
            <div className="notice__body">Prefilled with a suggestion from the checker — review it before closing.</div>
          </div>
        )}
        <fieldset className="methods">
          <legend className="field__label">Method</legend>
          {METHODS.filter(({ m }) => m !== 'UD' || /^\s*[∀@]/.test(line.text) || method === 'UD').map(({ m, name, fallback }) => (
            <label key={m} className={`method ${method === m ? 'is-selected' : ''}`}>
              <input type="radio" name="close-method" value={m} checked={method === m} onChange={() => setMethod(m)} data-autofocus={method === m ? '' : undefined} />
              <span>
                <strong>{m}</strong> · {name}
                <span className="method__desc">{getRuleInfo(m)?.explanation ?? fallback}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label className="field__label" htmlFor="close-refs">Cited lines</label>
          <input
            id="close-refs"
            className="input"
            inputMode="decimal"
            value={refsText}
            onChange={(e) => setRefsText(e.target.value)}
            placeholder={method === 'ID' ? 'e.g. 4, 6 (the contradiction)' : method === 'UD' ? 'e.g. 7 (the instance)' : 'e.g. 5'}
            aria-invalid={refs === null || undefined}
            aria-describedby="close-refs-help"
          />
          <span className="field__help" id="close-refs-help">
            {refs === null
              ? 'Use line numbers separated by commas or spaces.'
              : method === 'ID'
                ? 'Cite the two lines that contradict each other.'
                : method === 'CD'
                  ? 'Cite the line where you derived the consequent.'
                  : method === 'UD'
                    ? 'Cite the line with the instance φ (for a new variable) that you generalize.'
                  : 'Cite the line where you derived the formula.'}
          </span>
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
