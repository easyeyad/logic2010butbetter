import type { DraftLine } from '../../../proof';
import {
  closeAndContinue,
  deleteLine,
  depthAfter,
  insertLine,
  layoutRails,
  moveLine,
  parseRefs,
  shiftDepth,
  trimTrailingBlank,
} from './draftOps';

const L = (id: string, kind: DraftLine['kind'], text: string, depth: number, extra: Partial<DraftLine> = {}): DraftLine => ({ id, kind, text, depth, ...extra });

const base = (): DraftLine[] => [
  L('1', 'premise', 'P → Q', 0),
  L('2', 'premise', 'Q → R', 0),
  L('3', 'show', 'P → R', 0),
  L('4', 'assumption', 'P', 1, { assumption: 'CD' }),
  L('5', 'step', 'Q', 1, { rule: 'MP', refs: [1, 4] }),
  L('6', 'step', 'R', 1, { rule: 'MP', refs: [2, 5] }),
];

test('insert renumbers refs at or after the insertion point', () => {
  const { lines, index } = insertLine(base(), 3, L('x', 'step', '', 1));
  expect(index).toBe(4);
  expect(lines[5].refs).toEqual([1, 4]);
  expect(lines[6].refs).toEqual([2, 6]);
});

test('delete drops refs to the deleted line and shifts later ones', () => {
  const lines = deleteLine(base(), 3); // delete line 4 (the assumption)
  expect(lines).toHaveLength(5);
  expect(lines[3].refs).toEqual([1]);
  expect(lines[4].refs).toEqual([2, 4]);
});

test('move swaps lines and their references', () => {
  const { lines, index } = moveLine(base(), 4, 1);
  expect(index).toBe(5);
  expect(lines[4].id).toBe('6');
  expect(lines[4].refs).toEqual([2, 6]);
  expect(lines[5].refs).toEqual([1, 4]);
});

test('new lines go inside an open show box; closing the last box adds no stray line', () => {
  const ls = base();
  expect(depthAfter(ls, 2)).toBe(1); // after "Show"
  expect(depthAfter(ls, 5)).toBe(1); // inside the open box
  const closed = closeAndContinue(ls, 2, 'CD', [6]);
  expect(closed.lines[2].close).toEqual({ method: 'CD', refs: [6] });
  expect(closed.lines).toHaveLength(6);
  expect(closed.focusId).toBe('3');
});

test('closing the last box removes a trailing blank line inside it', () => {
  const ls = [...base(), L('b', 'step', '', 1)];
  const r = closeAndContinue(ls, 2, 'CD', [6]);
  expect(r.lines).toHaveLength(6);
});

test('closing an inner box continues on a line at the outer depth', () => {
  const ls: DraftLine[] = [
    L('s0', 'show', 'P → (Q → P)', 0),
    L('a0', 'assumption', 'P', 1, { assumption: 'CD' }),
    L('s1', 'show', 'Q → P', 1),
    L('a1', 'assumption', 'Q', 2, { assumption: 'CD' }),
    L('r', 'step', 'P', 2, { rule: 'R', refs: [2] }),
    L('b', 'step', '', 2),
  ];
  const r = closeAndContinue(ls, 2, 'CD', [5]);
  expect(r.focusId).toBe('b');
  expect(r.lines[5].depth).toBe(1);
});

test('indent is bounded by the previous line', () => {
  const ls = base();
  expect(shiftDepth(ls, 1, 1)).toBe(ls); // premise after premise can't nest
  expect(shiftDepth(ls, 3, -1)[3].depth).toBe(0);
});

test('box rails mark start, end and closed state', () => {
  const ls = base();
  ls[2] = { ...ls[2], close: { method: 'CD', refs: [6] } };
  const rails = layoutRails(ls);
  expect(rails[3]).toEqual([{ owner: 2, closed: true, start: true, end: false }]);
  expect(rails[5][0].end).toBe(true);
  expect(rails[0]).toEqual([]);
});

test('parseRefs accepts commas, spaces and dots', () => {
  expect(parseRefs('1, 2')).toEqual([1, 2]);
  expect(parseRefs('1 2')).toEqual([1, 2]);
  expect(parseRefs('3.4')).toEqual([3, 4]);
  expect(parseRefs('1,a')).toBeNull();
});

test('trailing blank lines are trimmed for the engine', () => {
  const ls = [...base(), L('b', 'step', '', 1), L('c', 'step', '', 1)];
  expect(trimTrailingBlank(ls)).toHaveLength(6);
});
