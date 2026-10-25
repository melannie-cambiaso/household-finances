# Feature: architecture by feature modules

Goal: reorganize `src/` so that everything of one feature lives in one folder, shared helpers have their own place, and names follow one pattern, without changing what the app does.

Decision (user): "B: módulos completos" — each feature gathers all its code (rules, service, actions, components, tests) in `src/features/<name>/`, and the routes of `app/` become thin shells.

Out of scope: any behavior change, new features, a different folder for the database, a lint rule that enforces the layout (proposed at the end, not built), renaming routes or URLs.

Branches: one per pull request, in this order (each one leaves `main` green): `refactor/arch-shared`, `refactor/arch-accounts-catalog-savings`, `refactor/arch-expenses-incomes-transfers`, `refactor/arch-budget-dashboard-auth`.

## Specs

- S1: "me estoy dando cuenta que la arquitectura y sistema de carpetas de este proyecto ya se agrandó mucho y no es tan legible de entender" (user, L1)
- S2: Each feature has one folder, `src/features/<name>/`, with the same file names everywhere: `rules.ts` (pure validation and calculation), `service.ts` (database), `actions.ts` (Server Actions), the components of that feature, `<name>-page.tsx` (the page), and the tests next to what they test (`rules.test.ts`, `service.test.ts`).
- S3: The helpers that every feature uses (ids, money, dates and months) live in `src/shared/`, not inside the expenses module. No feature imports them from another feature.
- S4: Nothing changes for the user: the same pages at the same URLs, showing the same data, with the same behavior.
- S5: Nothing is lost on the way: every existing test still runs (no test deleted or skipped), `tsc`, lint, the build and the CI stay green, and files are moved with `git mv` so their history follows them.
- S6: What the Node test runner imports keeps using relative paths with the `.ts` extension, because Node does not resolve the `@/` alias; files that only Next compiles can keep using `@/`.

## Design decisions (mine, not the user's; change them if you disagree)

- Layout: `src/app/` only routes, `src/features/<name>/`, `src/shared/` (cross-cutting helpers and the generic `Modal`), `src/db/` unchanged.
- Features: `expenses`, `incomes`, `transfers`, `budget`, `catalog` (the `/categories` page: categories and items), `savings`, `dashboard` (the home page), `auth`, and a new small `accounts`.
- `accounts` exists because `listAccounts` lives in the expense service but incomes and transfers use it. `listItems` moves to `catalog` for the same reason: budget and expenses use it, and items belong to the catalog.
- A route file becomes a re-export of the page of its feature, for example `export { default } from "@/features/expenses/expenses-page"`. If Next does not accept a re-export in this setup, the route keeps a minimal wrapper instead.
- The `Sidebar` and the `(app)` layout stay in `src/app/(app)/`: they only serve that layout.
- Four pull requests instead of one, so that each one stays small to review and leaves `main` working: shared helpers; accounts, catalog and savings; expenses, incomes and transfers; budget, dashboard, auth and the documentation.
- The historical tracking files in `odd/tasks/` keep the old paths they were written with.

## Tasks

- T1 (S3, S5, S6): create `src/shared/` with the id, money and date helpers taken out of `expenses.ts`, split their tests, and point every import to it. Route: inline, test-first where behavior moves. Done, commit 0fab7a8: helpers cut out of expenses.ts into src/shared/{ids,money,dates}.ts, tests split into money.test.ts and dates.test.ts, 22 files rewired. A line-by-line comparison against the original found 0 code lines lost or added (only import lines differ); tsc, lint and the unit tests unchanged at 113 pass.
- T2 (S2): move the generic `Modal` to `src/shared/ui/modal.tsx`. Route: inline. Done, commit 1172724: git sees a rename of modal.tsx; the 11 files that used it point to @/shared/ui/modal and no old reference is left; tsc and lint clean.
- T3 (S2, S3): `accounts` (new) and `catalog`: move the files, take `listAccounts` and `listItems` out of the expense service. Route: inline. Commit: pending.
- T4 (S2): `savings`. Route: inline. Commit: pending.
- T5 (S2): `expenses`. Route: inline. Commit: pending.
- T6 (S2): `incomes`. Route: inline. Commit: pending.
- T7 (S2): `transfers`. Route: inline. Commit: pending.
- T8 (S2): `budget`. Route: inline. Commit: pending.
- T9 (S2): `dashboard`, `auth` and the app shell. Route: inline. Commit: pending.
- T10 (S1, S5): `docs/architecture.md`, README, `docs/stack.md` if it names folders, an independent verification and the closing "Not verified" list. Route: inline plus one `gentle-ai-verify`. Commit: pending.

## Commits

- 0fab7a8 refactor: move the id, money and date helpers to src/shared (T1)
- 1172724 refactor: move the generic Modal to src/shared/ui (T2)

## Log

- L1 (user): "me estoy dando cuenta que la arquitectura y sistema de carpetas de este proyecto ya se agrandó mucho y no es tan legible de entender"
- L2 (user): chose "B: módulos completos".

## Not verified

(to fill when the feature closes)
