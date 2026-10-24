# Feature: incomes

Goal: register money received (including reimbursements linked to the expense they cover) and see which reimbursements are still pending, from a page at `/incomes`.

Decision: incomes and the pending-reimbursement view only. Mirrors the `expenses` feature.

Out of scope: edit/delete incomes, budget months and lines, planned vs. received income, the Friday calendar computation (`rate * fridays`), transfers, savings debt, account balances.

Branch: `feat/incomes`

## Specs

- S1: "Reimbursements: Modeled as **income** in the month they arrive. They never reduce the original expense. The app **suggests** the expected amount (`expense * reimbursement_pct`) and tracks what is still pending." (docs/data-model.md)
- S2: "Pending reimbursement: expected - sum(incomes.amount WHERE related_expense_id = expense.id)" (docs/data-model.md)
- S3: "related_expense_id: Links a reimbursement to the expense it covers. Does not affect budget totals, but drives the pending-reimbursement view." (docs/data-model.md)
- S4: "Month ownership: Every expense belongs to a budget month, independent of the date it was paid." Same rule for incomes: `budget_month` defaults to the month of `received_on` and can be overridden.
- S5: "Money: Stored as integer amounts (no floats). Assumes a currency without decimals (CLP)."

## Design decisions (mine, not the user's; change them if you disagree)

- Same security model as expenses: the action re-checks the session; household and `created_by` come from the session; the income source, account and related expense must belong to the household.
- A related expense is allowed only when the source kind is `reimbursement`, and only for an expense that has a `reimbursement_pct`. Any other combination is rejected.
- Over-reimbursement is allowed (the insurer may pay more or less than expected); pending never goes below zero.
- The pending view lists all months, not the selected one: a reimbursement usually arrives in a later month than the expense.
- The account defaults to the source's `default_account_id` in the form.
- Pure logic goes in `src/lib/incomes.ts` (reusing helpers from `src/lib/expenses.ts`), service in `src/lib/income-service.ts` with an integration test gated by `TEST_DATABASE_URL`. UI copy in English.

## Tasks

- [x] 1. Pure logic (`src/lib/incomes.ts`): input validation, pending-reimbursement math — test-first (S2, S4, S5)
- [x] 2. Income service (`src/lib/income-service.ts`): household checks, related-expense rules, insert, list by month, list pending reimbursements — test-first with integration test (S1, S3)
- [x] 3. Server Action and the `/incomes` page (form + month list + pending section) with a sidebar entry
- [x] 4. README and close

## Commits

(one work-unit commit per task, recorded here)

- Task 1: `ee4e4d4` feat: add income validation and pending reimbursement helpers. RED (module not found), GREEN 43/43 (8 new), tsc and lint clean.
- Task 2: `c3d2f77` feat: add income service with household isolation. RED (module not found), GREEN 9/9 on a Neon branch copy with both migrations (`TEST_DATABASE_URL`): own-household insert, linked reimbursement, source/account/expense from another household rejected with no row inserted, non-reimbursement source and non-reimbursable expense rejected, month list scoped and newest first, pending list across months (partial, settled and over-paid handled). Cleanup verified: row counts identical before and after, 0 leftover test households. Full suite 58/58, tsc and lint clean.
- Task 3: `8c8104a` feat: add incomes page with form, month list and pending reimbursements. tsc, lint, 58 tests and build PASS (`/incomes` is Partial Prerender). Production server: unauthenticated GET and direct POST to `/incomes` redirect to `/login`. The action, form and page are only type-checked, built and redirect-checked, not exercised with a session.
- Task 4: `839ef15` docs: document the incomes page and pending reimbursements.

## Log

- L1 (user): "si, arranquemos con eso" — after the assistant recommended "ingresos y reembolsos" as the next feature (register incomes incl. Friday income, link a reimbursement income to an expense, pending-reimbursement view).

## Not verified

- (Resolved after the PR) The author confirmed in the browser that an expense appears in Pending reimbursements and that a linked reimbursement income was collected.
- The integration tests ran against a Neon branch copy, not a local Postgres.
- L2 (user): "por ahora dejemoslo sin revisión" — native review of the feature candidate (`review-91d6bbb859ad1e1c`) left open on purpose after the risk-lens reviewer refused the harness prompt (no JSON returned, slot not consumed). The candidate stays unreviewed; own verification stands.
