import type { ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

/**
 * Feedback that was computed for an earlier input. While `stale`, a banner
 * says so (with a re-check button when checking is possible) and the old
 * feedback is dimmed, inert and hidden from assistive tech, so it can never
 * read as a verdict on what is on screen now.
 */
export function StaleNotice({
  stale,
  what,
  onRecheck,
  recheckLabel = 'Check again',
  detail = 'The feedback below is for the earlier version.',
  next,
  children,
}: {
  stale: boolean;
  /** e.g. "the argument", "your answer". */
  what: string;
  /** Shows a re-check button in the banner. Omit when the page's own Check button is right there. */
  onRecheck?: () => void;
  /** Sentence after `detail` when there is no button, e.g. how to re-check. */
  next?: string;
  recheckLabel?: string;
  /** Sentence saying what the dimmed feedback belongs to. */
  detail?: string;
  children: ReactNode;
}) {
  return (
    <>
      {stale && (
        <div className="stale-banner" role="status" data-testid="stale-banner">
          <Icon name="alert" size={20} />
          <span className="grow">
            <strong>Out of date</strong> — you changed {what} after checking. {detail}
            {next && ` ${next}`}
          </span>
          {onRecheck && (
            <Button variant="primary" size="sm" icon="refresh" onClick={onRecheck}>
              {recheckLabel}
            </Button>
          )}
        </div>
      )}
      <div className={stale ? 'is-stale' : 'stale-wrap'} aria-hidden={stale || undefined} inert={stale || undefined}>
        {children}
      </div>
    </>
  );
}
