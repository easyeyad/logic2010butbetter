import type { Valuation } from '../../../logic';

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/** "When P is false and Q is true, both premises are true but the conclusion is false, …" */
export function countermodelNarrative(atoms: string[], v: Valuation, premiseCount: number): string {
  const letters = joinAnd(atoms.map((a) => `${a} is ${v[a] ? 'true' : 'false'}`));
  const prem =
    premiseCount === 0
      ? 'there are no premises to satisfy'
      : premiseCount === 1
        ? 'the premise is true'
        : premiseCount === 2
          ? 'both premises are true'
          : `all ${premiseCount} premises are true`;
  return `When ${letters}, ${prem} but the conclusion is false, so the argument is invalid.`;
}
