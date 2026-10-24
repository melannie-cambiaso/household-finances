# Feature: budget

Goal: plan a month's budget (copied from the previous month as a draft, editable, then confirmed and locked) and see planned vs. actual spending and income, from a page at `/budget`.

Decision (user): first delivery is budget + progress together ("Presupuesto + progreso").

Out of scope: transfers, savings debt, account balances, editing/deleting expenses or incomes, adding items/categories/sources from the UI, reopening a confirmed budget.

Branch: `feat/budget`

## Specs

- S1: "Budget lifecycle: A new month's budget is **copied from the previous month** as a `draft`, editable freely. Once the user **confirms** it, it is locked (no adding or editing lines). If a month starts with no budget, the app auto-copies one as a `draft`. Expenses and incomes can be recorded in any state." (docs/data-model.md)
- S2: "Locking is an explicit user action, not a date rule. Confirmation is one-way: no reopening. A draft left unconfirmed stays editable even after its month has started." (docs/data-model.md)
- S3: "For `per_friday`, the planned amount of a month is `default_amount * fridays_in_month`, copied into the budget line when the month is created." (docs/data-model.md)
- S4: "Month progress, per item: planned (budget_lines) vs sum(expenses.amount) for that budget_month. Month progress, per category: sum over its items." (docs/data-model.md)
- S5: "Income progress: planned income lines vs sum(incomes.amount) for that budget_month" (docs/data-model.md)
- S6: "Constraint: exactly one of `item_id` / `income_source_id` is set. Unique per (month, target)." (docs/data-model.md)
- S7: "Money: Stored as integer amounts (no floats). Assumes a currency without decimals (CLP)." (docs/data-model.md)

## Design decisions (mine, not the user's; change them if you disagree)

- Creating a month's budget is an explicit button ("Create budget for <month>"), not a silent write on page load: a GET that inserts rows is a side effect. This is a deliberate deviation from "auto-copies" in S1; the copy itself follows S1.
- Copy rule: expense lines and fixed/reimbursement income lines copy the previous month's planned amount; `per_friday` lines are recomputed from the calendar (S3). With no previous budget, the draft starts with no lines.
- The editor lists every item and income source of the household with an amount input. Blank = no line; `0` is a valid line. Saving replaces the draft's lines in one transaction.
- Server-side lock: saving a confirmed month is rejected by the service, not just hidden in the UI. Confirm is one-way and sets `confirmed_at`.
- Concurrency: the unique (household, month) constraint decides; a second create returns the existing month instead of failing.
- Progress: items with spending but no line show planned `0` ("unplanned"). Reimbursement income counts toward income progress (S5). A month with no budget shows the create button and no progress.
- Household and author come from the session, never the form; item and source ids must belong to the household (same model as expenses and incomes).
- Pure logic in `src/lib/budget.ts` (reusing helpers from `src/lib/expenses.ts`), service in `src/lib/budget-service.ts`, integration tests gated by `TEST_DATABASE_URL`. UI copy in English.

## Tasks

- [x] 1. Pure logic (`src/lib/budget.ts`): Fridays in a month, planned amount of a source, planned-amount input validation, progress math — test-first (S3, S4, S5, S7)
- [x] 2. Budget service: create a month's draft by copying the previous month; get a month with its lines — test-first with integration test (S1, S3, S6)
- [x] 3. Budget service: save draft lines (household checks, locked months rejected) and confirm — test-first with integration test (S1, S2, S6)
- [x] 4. Budget service: planned vs. actual per item, category and income source — test-first with integration test (S4, S5)
- [x] 5. Server Actions and the `/budget` page: create button, draft editor, confirm, sidebar entry
- [x] 6. Progress section on `/budget`
- [x] 7. README and close

## Commits

(one work-unit commit per task, recorded here)
- Task 1: `c5a32f5` feat: add budget calendar, form parsing and progress helpers. RED (module not found), then one failing test caused by my own wrong expectation (Feb 2024 has 4 Fridays, not 5; verified against the calendar and replaced with a leap February that has 5 Fridays, 2008), GREEN 57/57, tsc and lint clean.
- Task 1 verification: independent `gentle-ai-verify` (required because the writer profile was unknown, so the plan raised the tier to high): PASS on S3, S4, S5, S7, no defects. Its only note (S7 coverage was borrowed from the expense tests) was closed in `245549f` test: cover budget form integer limit and zero spellings (58/58). Native review: not due (medium risk, under budget).
- Task 2: `5b25cb6` feat: add budget service to create a month by copy and read it. RED (module not found), GREEN 6/6 on the Neon branch copy: empty draft without an earlier budget; copy as a draft from a confirmed month with the per-Friday line recomputed (5 Fridays in Oct 2026 -> 4 in Nov, 200.000 not 250.000); most recent earlier month used and later ones ignored; second create returns the existing month without duplicating lines; another household's budget never copied or read; a non-first-day month rejected with nothing inserted. Full suite 79/79, tsc and lint clean, 0 leftover rows.
- Task 3: `c245e54` feat: save draft budget lines and confirm a month. RED (confirmBudgetMonth not exported), GREEN 12/12 on the Neon branch copy: replace a draft's lines (blank = line removed, 0 kept); item/source from another household rejected and the original lines survive; same target twice rejected; no budget -> month_not_found; confirm sets status and timestamp, confirming again keeps the timestamp, a confirmed month rejects saves (month_locked) with lines unchanged; confirming a missing or foreign month fails and leaves the other household's draft alone. Full suite 85/85, tsc and lint clean, 0 leftover rows.
- Task 4: `f486d10` feat: report planned vs actual spending and income for a month. RED twice (buildProgressReport and getBudgetProgress not exported). Pure aggregation unit-tested (category grouping and sums, zero-line vs. unplanned, unknown ids ignored, totals); service GREEN 3/3 integration on the Neon branch copy: sums only the month and household (other month and other household ignored), reimbursement income counted, spending without a line flagged unplanned, month without a budget still reports actuals. Full suite 94/94, tsc and lint clean, 0 leftover rows.
- Task 5: `fa6327c` feat: add budget page with create, draft editor and confirm. tsc, lint and build PASS (`/budget` is Partial Prerender). Production server: unauthenticated GET and direct POST to `/budget` redirect to `/login`. The three Server Actions, the editor and the page are only type-checked, built and redirect-checked, not exercised with a session. Create and confirm are plain form actions that return nothing: a failure is logged and the page simply re-renders.
- Task 6: `65b267f` feat: show planned vs actual progress on the budget page. `barWidth` added test-first (RED: export missing; GREEN 67/67). The page shows spending by category and item and income by source, with totals, bars, 'not planned' tags and an over-spending warning, for draft and confirmed months. tsc, lint and build PASS; unauthenticated GET and POST to `/budget` still redirect to `/login`. The rendering itself (layout, bars, wording) is not exercised with a session.
- Task 7: `9eb8fad` docs: document the monthly budget page.

## Log

- L1 (user): "Arranquemos con el presupuesto mensual" — the next feature after incomes; earlier described by the assistant as "copiar el mes anterior como borrador, confirmarlo para bloquearlo y ver el progreso contra lo presupuestado".
- L2 (user): chose "Presupuesto + progreso" as the scope of the first delivery (page `/budget`: create or copy the month, edit draft amounts, confirm to lock, planned vs. actual by item and category for expenses and by source for incomes).
- L3 (user): "ya lo probé y funciona perfecto", then "creé un presupuesto y funcionó, lo edité, lo confirmé y el progreso están bien" — manual browser check of `/budget` by the user covering create, edit, confirm and progress.


## Not verified

- (Resolved) The author exercised create, edit, confirm and the progress section of `/budget` in the browser with their own session and reported that all of it works. The notes below remain unverified.
- Concurrency of `saveBudgetLines` vs. `confirmBudgetMonth` (the `FOR UPDATE` on the month row): written to stop a save slipping in after a confirmation, but no test races the two calls.
- Two simultaneous `createBudgetMonth` calls (the `ON CONFLICT DO NOTHING` path): reasoned, not raced.
- Create and confirm are form actions that return nothing, so a failure is only logged and shown as an unchanged page.
- The integration tests ran against a Neon branch copy, not a local Postgres.
