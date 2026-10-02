import { useId, useMemo, useState } from 'react';
import type { RuleInfo } from '../../../proof';
import { useSettings } from '../../app/settings';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { ruleList } from '../../engine/safe';
import { RuleCard } from './RuleCard';
import { IDENTITY_RULE_IDS, QUANTIFIER_RULE_IDS } from '../proofs/justification';

type Cat = 'sentential' | 'quantifier' | 'identity' | 'derived' | 'structural';
type Group = 'all' | Cat;
const GROUPS: { key: Cat; title: string; blurb: string }[] = [
  { key: 'sentential', title: 'Sentential rules', blurb: 'The basic inference rules for ¬ ∧ ∨ → ↔.' },
  { key: 'quantifier', title: 'Quantifier rules', blurb: 'Instantiating and generalizing ∀ and ∃, and closing a “Show ∀x” box with UD.' },
  { key: 'identity', title: 'Identity rules', blurb: 'Reasoning with a = b: every term is identical to itself (Id), identicals can be swapped (LL), and identity runs both ways (SM).' },
  { key: 'derived', title: 'Derived rules', blurb: 'Shortcuts provable from the primitive rules. Turn them on in Settings.' },
  { key: 'structural', title: 'Structure: premises, assumptions & closing boxes', blurb: 'How derivations are organized.' },
];

/** Reference grouping (the engine's category, with quantifier rules pulled out). */
function catOf(r: RuleInfo): Cat {
  if (r.derived || r.category === 'derived') return 'derived';
  if (IDENTITY_RULE_IDS.has(String(r.id))) return 'identity';
  if (QUANTIFIER_RULE_IDS.has(String(r.id))) return 'quantifier';
  return r.category === 'structural' ? 'structural' : 'sentential';
}

/** Searchable rule reference. Used full-page and (compact) in the proof side panel. */
export function RulesPanel({ compact }: { compact?: boolean }) {
  const { settings } = useSettings();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<Group>('all');
  const searchId = useId();
  const rules = useMemo(() => ruleList(), []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rules.filter((r) => {
      if (group !== 'all' && catOf(r) !== group) return false;
      if (!s) return true;
      return (
        r.abbreviation.toLowerCase().includes(s) ||
        r.name.toLowerCase().includes(s) ||
        r.explanation.toLowerCase().includes(s)
      );
    });
  }, [rules, q, group]);

  if (rules.length === 0) {
    return (
      <EmptyState icon="book" title="Rule catalog not loaded yet">
        The proof engine hasn't published its rule list yet. Check back soon.
      </EmptyState>
    );
  }

  return (
    <div className={`rules-panel ${compact ? 'rules-panel--compact' : ''}`}>
      <div className="rules-panel__controls">
        <div className="search">
          <Icon name="search" size={18} />
          <label htmlFor={searchId} className="visually-hidden">Search rules</label>
          <input
            id={searchId}
            type="search"
            className="input search__input"
            placeholder="Search rules (e.g. MP, conditional)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="segmented" role="group" aria-label="Filter by category">
          {(['all', 'sentential', 'quantifier', 'identity', 'derived', 'structural'] as Group[]).map((g) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>
              {g === 'all' ? 'All' : g[0].toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <p className="visually-hidden" role="status">{filtered.length} rules shown</p>
      {filtered.length === 0 && <p className="subtle">No rules match “{q}”.</p>}
      {GROUPS.map((g) => {
        const items = filtered.filter((r) => catOf(r) === g.key);
        if (items.length === 0) return null;
        return (
          <section key={g.key} className="rules-group" aria-labelledby={`grp-${g.key}${compact ? '-c' : ''}`}>
            <div className="rules-group__head">
              <h2 id={`grp-${g.key}${compact ? '-c' : ''}`}>{g.title}</h2>
              {!compact && <p className="subtle">{g.blurb}</p>}
            </div>
            <div className="rules-grid">
              {items.map((r) => (
                <RuleCard key={r.id} rule={r} compact={compact} disabledNote={r.derived && !settings.derivedRules ? 'Off in Settings' : undefined} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
