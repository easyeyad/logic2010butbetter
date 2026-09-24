import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { progressStore } from '../../learning/progress';
import { useProofTracking } from './useProofTracking';
import { PageHeader } from '../../app/PageHeader';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Drawer } from '../../components/Drawer';
import { FormulaTargetProvider, useFormulaTarget } from '../../components/FormulaTarget';
import { SymbolBar } from '../../components/SymbolBar';
import { useToast } from '../../components/Toast';
import { BP, useMediaQuery } from '../../hooks/useMediaQuery';
import { ProblemPanel } from './ProblemPanel';
import { ProofEditor } from './ProofEditor';
import { SidePanel, type SideTab } from './SidePanel';
import { useProofEditor, type ProofProblem } from './useProofEditor';

function ProofsWorkspace() {
  const ed = useProofEditor();
  const toast = useToast();
  const target = useFormulaTarget();
  const wide = useMediaQuery(BP.wide);
  const desktop = useMediaQuery(BP.desktop);
  const [tab, setTab] = useState<SideTab>('feedback');
  const [overlayOpen, setOverlayOpen] = useState(false);
  const tracking = useProofTracking(ed);
  const [params, setParams] = useSearchParams();
  const formulaFocused = useFormulaFocus();

  // /proofs?open=<saved proof id> loads a saved proof.
  const openId = params.get('open');
  useEffect(() => {
    if (!openId) return;
    const rec = progressStore().getProof(openId);
    if (rec) {
      const premises = rec.draft.premises ?? rec.draft.lines.filter((l) => l.kind === 'premise').map((l) => l.text);
      ed.loadDocument({ problem: { id: rec.exerciseId ?? rec.id, title: rec.title, premises, goal: rec.draft.goal ?? '' }, lines: rec.draft.lines });
    }
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const errorCount = ed.check.ok
    ? ed.check.value.lines.reduce((n, l) => n + l.issues.filter((i) => i.severity === 'error').length, 0)
    : 0;

  const load = (p: ProofProblem) => {
    ed.loadProblem(p);
    toast.show(`Loaded “${p.title}”`, { label: 'Undo', run: ed.undo });
  };

  const goTo = (id: string) => {
    setOverlayOpen(false);
    // Let the sheet/drawer restore focus first, then move to the line.
    setTimeout(() => ed.focusLine(id, 'formula', 'end'), 30);
  };

  const openPanel = (t: SideTab) => {
    setTab(t);
    setOverlayOpen(true);
  };

  const side = (
    <SidePanel
      ed={ed}
      tab={tab}
      onTab={setTab}
      onGoTo={goTo}
      errorCount={errorCount}
      onHint={tracking.hint}
      onSolutionViewed={tracking.solutionViewed}
    />
  );

  const layout = wide ? 'three' : desktop ? 'two' : 'one';

  return (
    <div className={`proofs proofs--${layout}`}>
      <PageHeader
        title="Proofs"
        description={layout === 'one' ? undefined : 'Build a Logic 2010-style derivation. Each line is checked as you type.'}
        actions={
          layout === 'two' ? (
            <Button icon="panelRight" onClick={() => setOverlayOpen(true)} aria-haspopup="dialog">
              Feedback &amp; hints
              {errorCount > 0 && <span className="count" aria-label={`${errorCount} problems`}>{errorCount}</span>}
            </Button>
          ) : undefined
        }
      />
      <div className="proofs__grid">
        <aside className="proofs__problem" aria-label="Problem">
          <ProblemPanel problem={ed.doc.problem} onLoad={load} collapsible={layout === 'one'} />
        </aside>
        <div className="proofs__editor">
          <ProofEditor ed={ed} inlineSymbolBar={layout !== 'one'} />
        </div>
        {layout === 'three' && (
          <aside className="proofs__side" aria-label="Feedback, hints and rules">
            {side}
          </aside>
        )}
      </div>

      {layout === 'two' && (
        <Drawer open={overlayOpen} title="Feedback, hints & rules" onClose={() => setOverlayOpen(false)}>
          {side}
        </Drawer>
      )}

      {layout === 'one' && (
        <>
          <div className="actionbar" role="region" aria-label="Proof tools">
            {formulaFocused ? (
              <SymbolBar compact label="Insert symbol into the focused line" onInsert={(d) => target?.insert(d)} />
            ) : (
              <div className="actionbar__buttons">
                <Button size="sm" variant={errorCount > 0 ? 'danger' : 'default'} icon={errorCount > 0 ? 'xCircle' : 'checkCircle'} onClick={() => openPanel('feedback')} aria-haspopup="dialog">
                  Feedback{errorCount > 0 ? ` (${errorCount})` : ''}
                </Button>
                <Button size="sm" icon="lightbulb" onClick={() => openPanel('hints')} aria-haspopup="dialog">Hints</Button>
                <Button size="sm" icon="book" onClick={() => openPanel('rules')} aria-haspopup="dialog">Rules</Button>
              </div>
            )}
          </div>
          <BottomSheet open={overlayOpen} title="Feedback, hints & rules" onClose={() => setOverlayOpen(false)} tall>
            {side}
          </BottomSheet>
        </>
      )}
    </div>
  );
}

export default function ProofsPage() {
  return (
    <FormulaTargetProvider>
      <ProofsWorkspace />
    </FormulaTargetProvider>
  );
}

/**
 * True while a proof-line formula (or the action bar's symbol buttons) has
 * focus — the mobile bar then shows symbols instead of the panel buttons.
 */
function useFormulaFocus(): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const update = () => {
      const el = document.activeElement as HTMLElement | null;
      setFocused(Boolean(el && (el.matches('.proofs__editor [data-field="formula"]') || el.closest('.actionbar'))));
    };
    const onOut = () => setTimeout(update, 0);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', onOut);
    };
  }, []);
  return focused;
}
