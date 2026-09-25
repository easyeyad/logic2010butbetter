# Logic Studio

A modern, responsive replacement for UCLA's Logic 2010, covering both sentential and predicate logic. It works on phones, tablets and desktops, runs without an account, and saves progress in the browser.

## Features

- **Proofs**: Logic 2010-style (Kalish–Montague) derivations.
  - "Show" lines open boxes, which close with DD, CD or ID.
  - Rules: MP, MT, DN, R, S, ADJ, ADD, MTP, BC and CB, plus the derived rules DM, NC, NB, CDJ and SC (turn these on in Settings).
  - Lines are checked as you type, and a wrong line gets a specific explanation.
  - Dependency tracking, graded hints (three levels), and "Show solution" after a confirmation.
  - Undo/redo and keyboard-first editing.
  - 35 exercises, or enter your own problem; an invalid argument is flagged with a countermodel.
- **Truth Tables**:
  - Automatic mode shows every intermediate column and classifies the formula as tautology, contradiction or contingent.
  - Practice mode has per-cell feedback, hints and a classification step.
- **Countermodels**: checks whether an argument is valid, and shows any countermodel as readable cards with a plain-English explanation.
  - Quantified arguments are searched in finite worlds of up to 4 objects. Objects are shown as numbered chips, properties as ✓/✗ rows and relations as grids.
  - The page never claims a quantified argument is valid. When nothing turns up, it says so and suggests proving it with a derivation.
- **Symbolization**: 66 curated sentences plus a generator. Answers are graded on meaning. Common mistakes (converse, "only if", "unless", neither/nor versus not both, negation scope) get their own explanations.
- **Practice**: eight exercise types, difficulty from 1 to 5 or adaptive, hints before solutions, retry, and a first-try session score.
- **Progress / Dashboard**: accuracy, streak, weak areas, recommended practice and saved proofs.
- **Reference**: every rule, with its schema, an example, requirements and common pitfalls. It is also available inside the proof editor, as a side panel on desktop and a bottom sheet on mobile.
- **Formula input**: typing `~ & | -> <->` gives `¬ ∧ ∨ → ↔`, and `@`/`$` give `∀`/`∃`. Syntax errors highlight the exact spot with an explanation.
- **Predicate logic** (Logic 2010's quantifier chapters):
  - Syntax: predicates such as `Fa` and `Rxy`, names a–t, and variables u, w, x, y, z.
  - Proof rules UI, EG, EI (to a new variable) and the UD closing method, each with its restriction checked, plus the derived rules QN and AV.
  - 44 predicate symbolization sentences, where a wrong answer is shown alongside a small world that tells it apart from the correct one.
  - Model-checking exercises, a countermodel builder and 18 quantifier derivation problems.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the modules fit together.

## Development

```
npm install
npm run dev        # http://localhost:5173
npm test           # unit + cross-module tests (vitest)
npm run typecheck
npm run build      # static site in dist/ (relative base, hash routing)
npm run e2e        # Playwright: 7 viewports, axe accessibility, keyboard, reduced motion
```

## Scope

Identity (`=`) and function symbols are not supported yet. The shared `Formula` AST in `src/logic/ast.ts` is the place to extend it. Predicates with three or more places parse and check, but the practice model builder only handles one- and two-place predicates.
