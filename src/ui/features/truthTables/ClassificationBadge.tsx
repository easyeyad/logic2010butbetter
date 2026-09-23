import type { Classification } from '../../../logic';
import { Icon, type IconName } from '../../components/Icon';

const META: Record<Classification, { label: string; icon: IconName; tone: string }> = {
  tautology: { label: 'Tautology', icon: 'checkCircle', tone: 'ok' },
  contradiction: { label: 'Contradiction', icon: 'xCircle', tone: 'err' },
  contingent: { label: 'Contingent', icon: 'scale', tone: 'warn' },
};

export function explainClassification(c: Classification, trueRows: number, total: number): string {
  if (c === 'tautology') return `True in every one of the ${total} rows, so it can never be false.`;
  if (c === 'contradiction') return `False in every one of the ${total} rows, so it can never be true.`;
  return `True in ${trueRows} of ${total} rows and false in the other ${total - trueRows}, so its truth depends on the sentence letters.`;
}

export function ClassificationBadge({ c }: { c: Classification }) {
  const m = META[c];
  return (
    <span className={`badge badge--${m.tone}`}>
      <Icon name={m.icon} />
      {m.label}
    </span>
  );
}
