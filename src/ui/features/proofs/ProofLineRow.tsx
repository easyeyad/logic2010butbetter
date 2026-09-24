import { memo } from 'react';
import type { DraftLine, LineCheck } from '../../../proof';
import { FormulaInput } from '../../components/FormulaInput';
import { Icon } from '../../components/Icon';
import { justKeyOf, type RailInfo } from './draftOps';
import type { JustOption } from './justification';
import { LineMenu, type MenuAction } from './LineMenu';
import { RefsInput } from './RefsInput';
import { RulePicker } from './RulePicker';
import { lineStatus, STATUS_META } from './status';

export interface LineRowHandlers {
  onText: (id: string, text: string) => void;
  onJust: (id: string, key: string) => void;
  onRefs: (id: string, refs: number[]) => void;
  onFocus: (id: string) => void;
  onRequestClose: (id: string) => void;
  menuFor: (line: DraftLine, index: number) => MenuAction[];
}

interface Props {
  line: DraftLine;
  index: number;
  lc?: LineCheck;
  rails: RailInfo[];
  options: JustOption[];
  focused: boolean;
  /** Line numbers of lines that cite this one incorrectly. */
  citedBadlyBy?: number[];
  handlers: LineRowHandlers;
}

export const ProofLineRow = memo(function ProofLineRow({ line, index, lc, rails, options, focused, citedBadlyBy, handlers }: Props) {
  const n = index + 1;
  const status = lineStatus(line, lc);
  const meta = STATUS_META[status];
  const issues = (lc?.issues ?? []).filter((i) => i.code !== 'parse-error' || !line.text.trim());
  const errors = issues.filter((i) => i.severity === 'error');
  const target = (t: string) => issues.some((i) => i.severity === 'error' && i.target === t);
  const inClosedBox = lc?.boxed ?? rails.some((r) => r.closed);
  const isShow = line.kind === 'show';
  const closed = isShow && Boolean(line.close);
  const msgId = `line-msg-${line.id}`;
  const showMessages = focused && (issues.length > 0 || (lc?.dependsOn?.length ?? 0) > 0);

  const cls = [
    'line',
    `line--${line.kind}`,
    focused && 'is-focused',
    inClosedBox && 'is-boxed',
    closed && 'is-closed',
    citedBadlyBy && 'is-badref',
    `status-${status}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      className={cls}
      data-line-id={line.id}
      aria-label={`Line ${n}${isShow ? (closed ? ', closed show line' : ', open show line') : ''}: ${meta.label}`}
      onFocus={() => handlers.onFocus(line.id)}
    >
      <div className="line__gutter" aria-hidden="true">
        <span className="line__num">{n}</span>
        <span className="line__rails">
          {rails.map((r, k) => (
            <span key={k} className={`rail ${r.start ? 'rail--start' : ''} ${r.end ? 'rail--end' : ''} ${r.closed ? 'rail--closed' : ''}`} />
          ))}
        </span>
      </div>

      <div className="line__formula">
        {isShow && (
          <span className={`line__show ${closed ? 'is-closed' : ''}`} title={closed ? 'Show line (closed)' : 'Show line (open)'}>
            Show
          </span>
        )}
        <FormulaInput
          compact
          hideLabel
          hideSuccess
          label={`Line ${n} formula`}
          value={line.text}
          onChange={(t) => handlers.onText(line.id, t)}
          data-field="formula"
          invalid={target('formula')}
          describedBy={showMessages ? msgId : undefined}
          className="grow"
          placeholder={isShow ? 'what to show' : line.kind === 'premise' ? 'premise' : 'formula'}
        />
      </div>

      <div className="line__just">
        {isShow ? (
          closed ? (
            <span className="line__closedjust" title="Box closed">
              <Icon name="boxClose" size={16} />
              <span>
                {line.close!.method}
                {line.close!.refs.length > 0 && ` ${line.close!.refs.join(', ')}`}
              </span>
            </span>
          ) : (
            <button
              type="button"
              className={`btn btn--sm line__closebtn ${target('close') ? 'is-invalid' : ''}`}
              data-field="rule"
              onClick={() => handlers.onRequestClose(line.id)}
            >
              <Icon name="boxClose" />
              Close box
            </button>
          )
        ) : (
          <>
            <RulePicker
              value={justKeyOf(line)}
              options={options}
              onChange={(k) => handlers.onJust(line.id, k)}
              label={`Line ${n} justification`}
              invalid={target('rule')}
            />
            {line.kind === 'step' && (
              <RefsInput
                refs={line.refs}
                onChange={(r) => handlers.onRefs(line.id, r)}
                label={`Line ${n} cited lines`}
                invalid={target('refs')}
              />
            )}
          </>
        )}
      </div>

      <div className={`line__status line__status--${status}`} title={meta.label}>
        {meta.icon && <Icon name={meta.icon} size={18} />}
        <span className="visually-hidden">{meta.label}</span>
      </div>

      <div className="line__menu">
        <LineMenu label={`Actions for line ${n}`} actions={handlers.menuFor(line, index)} />
      </div>

      {citedBadlyBy && (
        <div className="line__badref">
          <Icon name="link" size={14} />
          Referenced by line{citedBadlyBy.length > 1 ? 's' : ''} {citedBadlyBy.join(', ')} — check how {citedBadlyBy.length > 1 ? 'those lines use' : 'that line uses'} it
        </div>
      )}

      {showMessages && (
        <div className="line__msgs" id={msgId}>
          {issues.map((iss, k) => (
            <div key={k} className={`line__msg line__msg--${iss.severity}`}>
              <Icon name={iss.severity === 'error' ? 'xCircle' : iss.severity === 'warning' ? 'alert' : 'info'} size={16} />
              <div>
                <span className="visually-hidden">{iss.severity}: </span>
                {iss.message}
                {iss.suggestion && <div className="line__suggest">{iss.suggestion}</div>}
              </div>
            </div>
          ))}
          {lc && lc.dependsOn.length > 0 && (
            <div className="line__deps">
              <span className="dep-chip" title="Premises and assumptions this line rests on">
                deps: {lc.dependsOn.join(', ')}
              </span>
              {lc.justification && <span className="subtle">Justification: {lc.justification}</span>}
              {errors.length === 0 && issues.length === 0 && <span className="subtle">No problems on this line.</span>}
            </div>
          )}
        </div>
      )}
    </li>
  );
});
