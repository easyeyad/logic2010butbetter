import type { RuleId } from '../../../proof';
import { getRuleInfo, ruleList } from '../../engine/safe';

export interface JustOption {
  key: string;
  abbr: string;
  name: string;
  group: 'Rules' | 'Derived rules' | 'Line types';
}

const PRIMITIVE: [RuleId, string][] = [
  ['MP', 'Modus Ponens'],
  ['MT', 'Modus Tollens'],
  ['DN', 'Double Negation'],
  ['R', 'Repetition'],
  ['S', 'Simplification'],
  ['ADJ', 'Adjunction'],
  ['ADD', 'Addition'],
  ['MTP', 'Modus Tollendo Ponens'],
  ['BC', 'Biconditional to Conditional'],
  ['CB', 'Conditionals to Biconditional'],
];
const DERIVED: [RuleId, string][] = [
  ['DM', "De Morgan's"],
  ['NC', 'Negation of Conditional'],
  ['NB', 'Negation of Biconditional'],
  ['CDJ', 'Conditional as Disjunction'],
  ['SC', 'Separation of Cases'],
];

/**
 * Options for the justification combobox. Uses the proof engine's rule list
 * when available (falls back to the Logic 2010 rule ids).
 */
export function justificationOptions(allowDerived: boolean): JustOption[] {
  const fromEngine = ruleList().filter((r) => r.category !== 'structural');
  let rules: JustOption[];
  if (fromEngine.length > 0) {
    rules = fromEngine
      .filter((r) => allowDerived || !r.derived)
      .map((r) => ({ key: String(r.id), abbr: r.abbreviation, name: r.name, group: r.derived ? 'Derived rules' : 'Rules' }));
  } else {
    rules = [
      ...PRIMITIVE.map(([k, n]) => ({ key: k, abbr: k, name: n, group: 'Rules' as const })),
      ...(allowDerived ? DERIVED.map(([k, n]) => ({ key: k, abbr: k, name: n, group: 'Derived rules' as const })) : []),
    ];
  }
  return [
    ...rules,
    { key: 'PR', abbr: 'PR', name: 'Premise', group: 'Line types' },
    { key: 'ASS CD', abbr: 'ASS CD', name: 'Assumption for conditional derivation', group: 'Line types' },
    { key: 'ASS ID', abbr: 'ASS ID', name: 'Assumption for indirect derivation', group: 'Line types' },
  ];
}

export function ruleName(key: string): string {
  const info = getRuleInfo(key);
  if (info) return info.name;
  const all = [...PRIMITIVE, ...DERIVED].find(([k]) => k === key);
  return all ? all[1] : key;
}

/** Filter + rank options for typed text: exact abbreviation, prefix, then name match. */
export function filterOptions(options: JustOption[], query: string): JustOption[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return options;
  const score = (o: JustOption) => {
    const a = o.abbr.toLowerCase();
    const n = o.name.toLowerCase();
    if (a === q) return 0;
    if (a.startsWith(q)) return 1;
    if (a.replace(' ', '').startsWith(q.replace(' ', ''))) return 1;
    if (n.startsWith(q)) return 2;
    if (n.split(/[\s']+/).some((w) => w.startsWith(q))) return 3;
    if (n.includes(q)) return 4;
    return 9;
  };
  return options
    .map((o) => ({ o, s: score(o) }))
    .filter((x) => x.s < 9)
    .sort((x, y) => x.s - y.s)
    .map((x) => x.o);
}

/** Exact abbreviation match for type-to-select ("mp" → MP, "assid" → ASS ID). */
export function exactMatch(options: JustOption[], query: string): JustOption | undefined {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return undefined;
  return options.find((o) => o.abbr.toLowerCase().replace(/\s+/g, '') === q);
}
