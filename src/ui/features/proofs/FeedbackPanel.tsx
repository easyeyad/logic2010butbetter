import type { DerivationCheck, DraftLine, LineIssue } from '../../../proof';
import { Icon } from '../../components/Icon';
import { EngineError, Notice } from '../../components/Notice';
import type { Safe } from '../../engine/safe';
import { isUntouched } from './draftOps';

function IssueItem({ issue, lineNo, onGo }: { issue: LineIssue; lineNo?: number; onGo?: () => void }) {
  const icon = issue.severity === 'error' ? 'xCircle' : issue.severity === 'warning' ? 'alert' : 'info';
  return (
    <li className={`issue issue--${issue.severity}`}>
      <Icon name={icon} size={18} />
      <div className="issue__body">
        <div className="issue__head">
          <span className="issue__sev">{issue.severity === 'error' ? 'Error' : issue.severity === 'warning' ? 'Warning' : 'Note'}</span>
          {lineNo != null && <span className="issue__line">Line {lineNo}</span>}
          {issue.badRefs && issue.badRefs.length > 0 && <span className="issue__refs">cites {issue.badRefs.join(', ')}</span>}
        </div>
        <p>{issue.message}</p>
        {issue.suggestion && <p className="issue__suggest"><Icon name="lightbulb" size={14} /> {issue.suggestion}</p>}
        {onGo && (
          <button type="button" className="btn btn--sm" onClick={onGo}>
            Go to line {lineNo} <Icon name="arrowRight" />
          </button>
        )}
      </div>
    </li>
  );
}

/** All checker findings, with "go to line" buttons. */
export function FeedbackPanel({ check, lines, onGoTo }: { check: Safe<DerivationCheck>; lines: DraftLine[]; onGoTo: (id: string) => void }) {
  if (!check.ok) return <EngineError error={check.error} />;
  const c = check.value;
  const lineIssues = c.lines.flatMap((lc) =>
    lc.issues
      .filter(() => !(lines[lc.number - 1] && isUntouched(lines[lc.number - 1])))
      .map((iss, k) => ({ iss, lc, k })),
  );
  const errors = lineIssues.filter((x) => x.iss.severity === 'error').length;
  const pending = c.lines.filter((lc) => lines[lc.number - 1] && isUntouched(lines[lc.number - 1])).length;

  return (
    <div className="stack">
      {c.complete ? (
        <Notice tone="ok" title="Proof complete">{c.summary}</Notice>
      ) : errors > 0 ? (
        <Notice tone="err" title={`${errors} problem${errors === 1 ? '' : 's'} to fix`}>{c.summary}</Notice>
      ) : (
        <Notice tone="info" title="No mistakes so far">
          {pending > 0 ? 'Keep going — fill in the empty line to continue.' : c.summary}
        </Notice>
      )}
      {(c.globalIssues.length > 0 || lineIssues.length > 0) && (
        <ul className="issues">
          {c.globalIssues.map((iss, k) => (
            <IssueItem key={`g${k}`} issue={iss} />
          ))}
          {lineIssues.map(({ iss, lc, k }) => (
            <IssueItem key={`${lc.id}-${k}`} issue={iss} lineNo={lc.number} onGo={() => onGoTo(lc.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
