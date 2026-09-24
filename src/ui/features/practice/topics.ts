import type { Topic } from '../../../learning';
import type { IconName } from '../../components/Icon';

export type PracticeTopic = Topic | 'mixed';

export const TOPIC_ICON: Record<PracticeTopic, IconName> = {
  wff: 'symbol',
  symbolization: 'symbol',
  'truth-table': 'table',
  validity: 'scale',
  countermodel: 'target',
  derivation: 'proof',
  'inference-rule': 'book',
  terminology: 'info',
  'predicate-symbolization': 'symbol',
  model: 'target',
  'predicate-countermodel': 'target',
  'quantifier-derivation': 'proof',
  'predicate-terminology': 'info',
  mixed: 'sparkle',
};

/** Order shown in the topic picker. */
export const SENTENTIAL_PICKER: PracticeTopic[] = ['wff', 'symbolization', 'truth-table', 'validity', 'countermodel', 'derivation', 'inference-rule', 'terminology'];
export const PREDICATE_PICKER: PracticeTopic[] = ['predicate-symbolization', 'model', 'predicate-countermodel', 'quantifier-derivation', 'predicate-terminology'];
export const PICKER_TOPICS: PracticeTopic[] = [...SENTENTIAL_PICKER, ...PREDICATE_PICKER, 'mixed'];
