import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { DraftLine } from '../../../proof';
import { Button } from '../../components/Button';
import { EngineError } from '../../components/Notice';
import { Icon } from '../../components/Icon';
import { SymbolBar } from '../../components/SymbolBar';
import { useFormulaTarget } from '../../components/FormulaTarget';
import { useToast } from '../../components/Toast';
import { CloseBoxDialog } from './CloseBoxDialog';
import { containingOpenShow, layoutRails, maxDepthAt } from './draftOps';
import { disabledDerivedOptions, justificationOptions } from './justification';
import type { MenuAction } from './LineMenu';
import { ProofLineRow, type LineRowHandlers } from './ProofLineRow';
import { ShortcutsDialog } from './ShortcutsDialog';
import { matchShortcut, SHORTCUT_LABEL } from './shortcuts';
import { visibleErrorCount } from './status';
import type { Field, ProofEditorState } from './useProofEditor';

/** The derivation editor: toolbar, line rows, close-box dialog, keyboard handling. */
export function ProofEditor({ ed, inlineSymbolBar = true }: { ed: ProofEditorState; inlineSymbolBar?: boolean }) {
  const toast = useToast();
  const target = useFormulaTarget();
  const [helpOpen, setHelpOpen] = useState(false);
  const { lines, ops, byId, badRefTargets, check } = ed;
  const options = useMemo(() => justificationOptions(ed.allowDerived), [ed.allowDerived]);
  const unavailable = useMemo(() => disabledDerivedOptions(ed.allowDerived), [ed.allowDerived]);
  const rails = useMemo(() => layoutRails(lines), [lines]);
  const complete = check.ok && check.value.complete;

  const removeWithUndo = useCallback(
    (id: string) => {
      const i = lines.findIndex((l) => l.id === id);
      if (ops.remove(id)) toast.show(`Line ${i + 1} deleted`, { label: 'Undo', run: ed.undo });
    },
    [lines, ops, toast, ed.undo],
  );

  const menuFor = useCallback(
    (line: DraftLine, index: number): MenuAction[] => {
      const openBox = line.kind === 'show' && !line.close ? index : containingOpenShow(lines, index);
      return [
        { key: 'below', label: 'Insert line below', icon: 'plus', kbd: SHORTCUT_LABEL.insertBelow, run: () => ops.insertAfter(index) },
        { key: 'show', label: 'New Show line below', icon: 'show', kbd: SHORTCUT_LABEL.insertShow, run: () => ops.insertShowAfter(index) },
        { key: 'ass', label: 'Add assumption below', icon: 'assume', kbd: SHORTCUT_LABEL.insertAssumption, run: () => ops.insertAssumptionAfter(index) },
        line.kind === 'show' && line.close
          ? { key: 'reopen', label: 'Reopen box', icon: 'box', run: () => ops.reopen(line.id), separatorBefore: true }
          : { key: 'close', label: 'Close box…', icon: 'boxClose', kbd: SHORTCUT_LABEL.closeBox, disabled: openBox < 0, run: () => ops.requestClose(line.id), separatorBefore: true },
        {
          key: 'toggle',
          label: line.kind === 'show' ? 'Make ordinary line' : 'Make Show line',
          icon: 'show',
          run: () => ops.toggleShow(line.id),
        },
        { key: 'indent', label: 'Indent', icon: 'indent', kbd: SHORTCUT_LABEL.indent, disabled: line.depth >= maxDepthAt(lines, index), run: () => ops.indent(line.id, 1), separatorBefore: true },
        { key: 'outdent', label: 'Outdent', icon: 'outdent', kbd: SHORTCUT_LABEL.outdent, disabled: line.depth === 0, run: () => ops.indent(line.id, -1) },
        { key: 'up', label: 'Move up', icon: 'arrowUp', kbd: SHORTCUT_LABEL.moveUp, disabled: index === 0, run: () => ops.move(line.id, -1) },
        { key: 'down', label: 'Move down', icon: 'arrowDown', kbd: SHORTCUT_LABEL.moveDown, disabled: index === lines.length - 1, run: () => ops.move(line.id, 1) },
        { key: 'delete', label: 'Delete line', icon: 'trash', kbd: SHORTCUT_LABEL.deleteLine, danger: true, disabled: lines.length <= 1, run: () => removeWithUndo(line.id), separatorBefore: true },
      ];
    },
    [lines, ops, removeWithUndo],
  );

  const handlers: LineRowHandlers = useMemo(
    () => ({
      onText: ops.updateText,
      onJust: ops.setJust,
      onRefs: ops.setRefs,
      onFocus: ed.setFocusedId,
      onRequestClose: ops.requestClose,
      menuFor,
    }),
    [ops, ed.setFocusedId, menuFor],
  );

  // Undo/redo: listen on the document so it keeps working when the focused
  // line disappears (focus falls back to <body>), but leave other inputs alone.
  const sectionRef = useRef<HTMLElement>(null);
  const { undo, redo } = ed;
  useEffect(() => {
    const onDocKey = (e: globalThis.KeyboardEvent) => {
      const action = matchShortcut(e);
      if (action !== 'undo' && action !== 'redo') return;
      const t = e.target as Node;
      if (t !== document.body && !sectionRef.current?.contains(t)) return;
      e.preventDefault();
      if (action === 'undo') undo();
      else redo();
    };
    document.addEventListener('keydown', onDocKey);
    return () => document.removeEventListener('keydown', onDocKey);
  }, [undo, redo]);

  /** One keyboard handler for the whole editor (events bubble up from line inputs). */
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const el = e.target as HTMLElement;
    const action = matchShortcut(e);
    if (action === 'undo' || action === 'redo') return; // handled on the document
    const row = el.closest<HTMLElement>('[data-line-id]');
    if (!row) return;
    const id = row.dataset.lineId!;
    const index = lines.findIndex((l) => l.id === id);
    if (index < 0) return;
    const line = lines[index];
    const field = (el.dataset.field ?? 'formula') as Field;
    const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
    const go = (i: number, caret?: 'start' | 'end') => {
      const t = lines[i];
      if (t) ed.focusLine(t.id, field === 'refs' && t.kind !== 'step' ? 'formula' : field, caret);
    };

    if (!action && isInput && field === 'formula' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const input = el as HTMLInputElement;
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
      const atEnd = input.selectionStart === input.value.length;
      if (e.key === 'ArrowUp' && atStart && index > 0) {
        e.preventDefault();
        go(index - 1, 'end');
        return;
      }
      if (e.key === 'ArrowDown' && atEnd && index < lines.length - 1) {
        e.preventDefault();
        go(index + 1, 'start');
        return;
      }
      if (e.key === 'Backspace' && line.text === '' && line.kind === 'step' && !line.rule && lines.length > 1 && index > 0) {
        e.preventDefault();
        ops.remove(id);
        return;
      }
    }

    switch (action) {
      case 'insertBelow':
        if (!isInput) return;
        e.preventDefault();
        ops.insertAfter(index);
        break;
      case 'insertShow':
        e.preventDefault();
        ops.insertShowAfter(index);
        break;
      case 'insertAssumption':
        e.preventDefault();
        ops.insertAssumptionAfter(index);
        break;
      case 'closeBox':
        e.preventDefault();
        ops.requestClose(id);
        break;
      case 'indent':
        e.preventDefault();
        ops.indent(id, 1);
        break;
      case 'outdent':
        e.preventDefault();
        ops.indent(id, -1);
        break;
      case 'moveUp':
        e.preventDefault();
        ops.move(id, -1);
        break;
      case 'moveDown':
        e.preventDefault();
        ops.move(id, 1);
        break;
      case 'prevLine':
        e.preventDefault();
        go(index - 1);
        break;
      case 'nextLine':
        e.preventDefault();
        go(index + 1);
        break;
      case 'deleteLine':
        e.preventDefault();
        removeWithUndo(id);
        break;
      default:
        break;
    }
  };

  const focusedIndex = lines.findIndex((l) => l.id === ed.focusedId);
  const insertionPoint = focusedIndex >= 0 ? focusedIndex : lines.length - 1;

  return (
    <section ref={sectionRef} className="editor" aria-labelledby="editor-title" onKeyDown={onKeyDown}>
      <div className="editor__bar">
        <h2 id="editor-title" className="editor__title">Derivation</h2>
        <div className="editor__tools" role="toolbar" aria-label="Proof editing">
          <Button size="sm" variant="ghost" iconOnly icon="undo" label={`Undo (${SHORTCUT_LABEL.undo})`} disabled={!ed.canUndo} onClick={ed.undo} />
          <Button size="sm" variant="ghost" iconOnly icon="redo" label={`Redo (${SHORTCUT_LABEL.redo})`} disabled={!ed.canRedo} onClick={ed.redo} />
          <span className="editor__sep" aria-hidden="true" />
          <Button size="sm" icon="plus" onClick={() => ops.insertAfter(insertionPoint)} title={`Insert line (${SHORTCUT_LABEL.insertBelow})`}>
            Line
          </Button>
          <Button size="sm" icon="show" onClick={() => ops.insertShowAfter(insertionPoint)} title={`New Show line (${SHORTCUT_LABEL.insertShow})`}>
            Show
          </Button>
          <Button size="sm" icon="assume" onClick={() => ops.insertAssumptionAfter(insertionPoint)} title={`Add assumption (${SHORTCUT_LABEL.insertAssumption})`}>
            Assume
          </Button>
          <Button size="sm" variant="ghost" iconOnly icon="keyboard" label="Keyboard shortcuts" onClick={() => setHelpOpen(true)} className="hide-touch" />
        </div>
      </div>
      {inlineSymbolBar && (
        <div className="editor__symbols">
          <SymbolBar compact label="Insert symbol into the focused line" onInsert={(d) => target?.insert(d)} />
        </div>
      )}

      {complete && (
        <div className="proof-done" role="status">
          <Icon name="checkCircle" size={28} />
          <div>
            <div className="proof-done__title">Proof complete</div>
            <div>Every line checks out and every box is closed. Nicely done.</div>
          </div>
        </div>
      )}
      {!check.ok && <EngineError error={check.error} />}

      <ol className="proof-lines" aria-label="Derivation lines">
        {lines.map((line, i) => (
          <ProofLineRow
            key={line.id}
            line={line}
            index={i}
            lc={byId.get(line.id)}
            rails={rails[i]}
            options={options}
            unavailable={unavailable}
            focused={ed.focusedId === line.id}
            citedBadlyBy={badRefTargets.get(i + 1)}
            handlers={handlers}
          />
        ))}
      </ol>
      <button type="button" className="editor__add" onClick={() => ops.appendLine({})}>
        <Icon name="plus" size={18} /> Add line at end
      </button>

      <p className="editor__summary subtle" role="status" aria-live="polite">
        {!check.ok ? '' : complete || visibleErrorCount(lines, check.value.lines) > 0 ? check.value.summary : 'No mistakes so far — keep going.'}
      </p>

      <CloseBoxDialog
        open={ed.closeReq !== null}
        index={ed.closeReq?.index ?? 0}
        draft={ed.draft}
        onCancel={() => ed.setCloseReq(null)}
        onConfirm={(m, r) => ed.closeReq && ops.close(ed.closeReq.index, m, r)}
      />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
}
