# Logic Studio — Architecture

A modern, responsive replacement for UCLA's Logic 2010 (sentential logic).
Vite + React + TypeScript, no backend; progress is stored locally.

## Modules and ownership

| Area | Path | Owner | Notes |
|---|---|---|---|
| Formula AST, parser, formatter, evaluator, truth tables, validity/countermodels | `src/logic/` | Logic Engine | `src/logic/index.ts` is the public contract |
| Derivation model, inference rules, checker, proof hints | `src/proof/` | Proof Engine | `src/proof/index.ts` is the public contract |
| Exercises, symbolization, generators, feedback text, progress store | `src/learning/` | Learning System | depends on `logic` and `proof` only |
| App shell, routing, pages, components, styles | `src/ui/`, `src/main.tsx`, `index.html` | Frontend / UX | depends on the three engines; no logic in components |
| Unit/integration tests across modules, Playwright e2e, a11y | `e2e/`, `playwright.config.ts` | QA / Accessibility | module owners keep their own `*.test.ts` next to the code |

Rules:
- Engines are pure TypeScript with no React/DOM imports.
- All engines share one `Formula` AST (`src/logic/ast.ts`). There is exactly one parser.
- Don't edit files in another owner's area; request contract changes instead.

## Commands

```
npm run dev        # dev server
npm test           # vitest unit tests
npm run typecheck
npm run build
npm run e2e        # playwright (uses preinstalled chromium)
```
