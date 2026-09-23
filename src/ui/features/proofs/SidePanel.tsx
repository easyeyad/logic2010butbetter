import { Tabs } from '../../components/Tabs';
import { RulesPanel } from '../reference/RulesPanel';
import { FeedbackPanel } from './FeedbackPanel';
import { HintsPanel } from './HintsPanel';
import type { ProofEditorState } from './useProofEditor';

export type SideTab = 'feedback' | 'hints' | 'rules';

/** Feedback / Hints / Rules tabs — shown as a column, drawer or bottom sheet. */
export function SidePanel({
  ed,
  tab,
  onTab,
  onGoTo,
  errorCount,
}: {
  ed: ProofEditorState;
  tab: SideTab;
  onTab: (t: SideTab) => void;
  onGoTo: (id: string) => void;
  errorCount: number;
}) {
  return (
    <Tabs<SideTab>
      label="Proof assistance"
      active={tab}
      onChange={onTab}
      tabs={[
        {
          key: 'feedback',
          label: 'Feedback',
          badge: errorCount > 0 ? <span className="count" aria-label={`${errorCount} problems`}>{errorCount}</span> : undefined,
        },
        { key: 'hints', label: 'Hints' },
        { key: 'rules', label: 'Rules' },
      ]}
    >
      {tab === 'feedback' && <FeedbackPanel check={ed.check} lines={ed.lines} onGoTo={onGoTo} />}
      {tab === 'hints' && (
        <HintsPanel
          draft={ed.draft}
          premises={ed.doc.problem.premises}
          goal={ed.doc.problem.goal}
          onApply={ed.ops.applyHint}
          onSolution={(lines) => ed.replaceLines(lines)}
        />
      )}
      {tab === 'rules' && <RulesPanel compact />}
    </Tabs>
  );
}
