/** Crash-proof wrappers around the learning API (see engine/safe.ts). */
import * as learning from '../../learning';
import type { Answer, Exercise, Feedback, Solution } from '../../learning';
import { attempt, type Safe } from '../engine/safe';

export function safeCheckAnswer(ex: Exercise, answer: Answer): Safe<Feedback> {
  return attempt(() => learning.checkAnswer(ex, answer));
}
export function safeHints(ex: Exercise): string[] {
  const r = attempt(() => learning.getHints(ex));
  return r.ok ? r.value : [];
}
export function safeSolution(ex: Exercise): Safe<Solution> {
  return attempt(() => learning.getSolution(ex));
}
