/**
 * Checking a (possibly quantified) argument for the UI. Wraps the logic
 * engine so the UI can tell apart: problems with the input (inconsistent
 * arities, free variables), a countermodel, an exhaustive search that found
 * none, and a search that was too large to finish — and never claims more
 * than the engine established.
 */
import * as logic from '../../logic';
import type { Formula, Interpretation } from '../../logic';
import { attempt, safeFormat } from './safe';

export interface ArgInput {
  /** Field label, e.g. "premise 1" / "the conclusion". */
  label: string;
  formula: Formula;
}

export interface InputProblem {
  /** Indexes into the inputs array that are at fault. */
  inputs: number[];
  message: string;
}

export type PredicateCheck =
  | { kind: 'input-problems'; problems: InputProblem[] }
  | { kind: 'invalid'; model: Interpretation; searchedUpTo: number }
  | { kind: 'none-found'; searchedUpTo: number }
  | { kind: 'too-large'; searchedUpTo: number; note: string }
  | { kind: 'engine'; error: string };

const termsWord = (n: number) => `${n} term${n === 1 ? '' : 's'}`;

/** Inconsistent predicate arities and free variables, phrased for students. */
export function inputProblems(inputs: ArgInput[]): InputProblem[] {
  const out: InputProblem[] = [];
  const conflicts = attempt(() => logic.arityConflicts(...inputs.map((i) => i.formula)));
  if (conflicts.ok) {
    for (const c of conflicts.value) {
      const uses: { idx: number; arity: number }[] = [];
      inputs.forEach((inp, idx) => {
        const ps = attempt(() => logic.predicatesOf(inp.formula));
        if (ps.ok) ps.value.filter((p) => p.name === c.name).forEach((p) => uses.push({ idx, arity: p.arity }));
      });
      const parts = c.arities.map((a) => {
        const where = [...new Set(uses.filter((u) => u.arity === a).map((u) => inputs[u.idx].label))];
        return `${a === 0 ? 'as a sentence letter (no terms)' : `with ${termsWord(a)}`} in ${where.join(' and ')}`;
      });
      out.push({
        inputs: [...new Set(uses.map((u) => u.idx))],
        message: `${c.name} is used ${parts.join(', but ')}. A predicate letter must always take the same number of terms.`,
      });
    }
  }
  inputs.forEach((inp, idx) => {
    const fv = attempt(() => logic.freeVariables(inp.formula));
    if (!fv.ok || fv.value.length === 0) return;
    const v = fv.value[0];
    const text = safeFormat(inp.formula);
    const closed = attempt(() => logic.format(logic.Forall(v, inp.formula)));
    const named = attempt(() => {
      const s = logic.substitute(inp.formula, v, logic.Name('a'));
      return s ? logic.format(s) : null;
    });
    const suggestions = [closed.ok ? closed.value : null, named.ok ? named.value : null].filter(Boolean);
    out.push({
      inputs: [idx],
      message: `${text} (${inp.label}) is not a sentence: ${fv.value.join(', ')} ${fv.value.length > 1 ? 'are' : 'is'} free. Countermodels need sentences${
        suggestions.length ? ` — did you mean ${suggestions.join(' or ')}?` : '.'
      }`,
    });
  });
  return out;
}

/** Search for a countermodel with up to `maxDomain` objects. */
export function checkPredicateArgument(premises: Formula[], conclusion: Formula, maxDomain = 4): PredicateCheck {
  const inputs: ArgInput[] = [
    ...premises.map((f, i) => ({ label: `premise ${i + 1}`, formula: f })),
    { label: 'the conclusion', formula: conclusion },
  ];
  const problems = inputProblems(inputs);
  if (problems.length) return { kind: 'input-problems', problems };
  const r = attempt(() => logic.findModel(premises, [conclusion], { maxDomain }));
  if (!r.ok) return { kind: 'engine', error: r.error };
  const m = r.value;
  if (m.status === 'found' && m.model) return { kind: 'invalid', model: m.model, searchedUpTo: m.searchedUpTo };
  if (m.status === 'none-up-to-limit' && m.searchedUpTo >= 1) return { kind: 'none-found', searchedUpTo: m.searchedUpTo };
  return { kind: 'too-large', searchedUpTo: m.searchedUpTo, note: m.note };
}

/** "#1 is F; #2 is not F; #1 bears R to #2" — a model in plain words. */
export function describeModelInWords(m: Interpretation): string[] {
  const o = (i: number) => `#${i + 1}`;
  const lines: string[] = [];
  lines.push(`The domain has ${m.domainSize} object${m.domainSize === 1 ? '' : 's'}: ${Array.from({ length: m.domainSize }, (_, i) => o(i)).join(', ')}.`);
  const byObj = new Map<number, string[]>();
  for (const [n, v] of Object.entries(m.names).sort(([a], [b]) => a.localeCompare(b))) byObj.set(v, [...(byObj.get(v) ?? []), n]);
  for (const [v, ns] of [...byObj].sort(([a], [b]) => a - b)) {
    if (ns.length === 1) lines.push(`${ns[0]} names ${o(v)}.`);
    else lines.push(`${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]} name the same object ${o(v)}, so ${ns[0]} = ${ns[1]} is true.`);
  }
  if (byObj.size > 1) {
    const firsts = [...byObj.values()].map((ns) => ns[0]);
    lines.push(`${firsts[0]} and ${firsts[1]} name different objects, so ${firsts[0]} ≠ ${firsts[1]}.`);
  }
  for (const [name, p] of Object.entries(m.predicates).sort(([a], [b]) => a.localeCompare(b))) {
    if ('value' in p) {
      lines.push(`${name} is ${p.value ? 'true' : 'false'}.`);
    } else if (p.arity === 1) {
      const has = (i: number) => p.extension.some((t) => t[0] === i);
      lines.push(Array.from({ length: m.domainSize }, (_, i) => `${o(i)} is ${has(i) ? '' : 'not '}${name}`).join('; ') + '.');
    } else if (p.arity === 2) {
      lines.push(p.extension.length ? p.extension.map(([a, b]) => `${o(a)} bears ${name} to ${o(b)}`).join('; ') + '; nothing else does.' : `Nothing bears ${name} to anything.`);
    } else {
      lines.push(p.extension.length ? `${name} holds of ${p.extension.map((t) => `⟨${t.map(o).join(', ')}⟩`).join(', ')}.` : `${name} holds of nothing.`);
    }
  }
  return lines;
}
