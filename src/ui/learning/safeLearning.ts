/** Crash-proof wrappers around the learning API (see engine/safe.ts). */
import * as learning from '../../learning';
import type { Answer, Exercise, Feedback, Solution } from '../../learning';
import { attempt, type Safe } from '../engine/safe';

export function safeCheckAnswer(ex: Exercise, answer: Answer): Safe<Feedback> {
  const r = attempt(() => learning.checkAnswer(ex, answer));
  if (r.ok && (!r.value || typeof r.value.headline !== 'string')) return { ok: false, error: 'not implemented' };
  return r;
}
export function safeHints(ex: Exercise): string[] {
  const r = attempt(() => learning.getHints(ex));
  return r.ok && Array.isArray(r.value) ? r.value.filter((h) => typeof h === 'string') : [];
}
export function safeSolution(ex: Exercise): Safe<Solution> {
  const r = attempt(() => learning.getSolution(ex));
  if (r.ok && (!r.value || typeof r.value.summary !== 'string')) return { ok: false, error: 'not implemented' };
  return r;
}
