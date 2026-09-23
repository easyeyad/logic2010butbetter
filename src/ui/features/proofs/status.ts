import type { DraftLine, LineCheck } from '../../../proof';
import type { IconName } from '../../components/Icon';

export type LineStatus = 'pending' | 'empty' | 'ok' | 'error' | 'warning' | 'open';

/** Presentation of a line's check result (icon + words, never color alone). */
export const STATUS_META: Record<LineStatus, { label: string; icon?: IconName }> = {
  pending: { label: 'Not checked yet' },
  empty: { label: 'Empty line' },
  ok: { label: 'Correct', icon: 'checkCircle' },
  error: { label: 'Has a problem', icon: 'xCircle' },
  warning: { label: 'Warning', icon: 'alert' },
  open: { label: 'Open — box not closed yet', icon: 'circleDashed' },
};

export function lineStatus(line: DraftLine, lc: LineCheck | undefined): LineStatus {
  if (line.kind === 'step' && line.text.trim() === '' && !line.rule) return 'empty';
  if (!lc) return 'pending';
  if (lc.issues.some((i) => i.severity === 'error')) return 'error';
  if (lc.issues.some((i) => i.severity === 'warning')) return 'warning';
  if (line.kind === 'show' && (lc.showStatus === 'open' || !line.close)) return 'open';
  return lc.ok ? 'ok' : 'error';
}
