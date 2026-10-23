# Feature: expenses

Goal: register an expense and see the month's expenses, from a page at `/expenses`.

Decision: expenses only. Incomes and reimbursements (linking an income to an expense, pending-reimbursement view) are the next feature.

Out of scope: incomes, edit/delete expenses, budget months and lines, progress vs. budget, transfers, savings debt, filtering beyond the month.

Branch: `feat/expenses`

## Design decisions

- Server Actions are reachable by direct POST, so every action re-checks the session (`getAllowedSession`) and never trusts ids from the form: the item and the account must belong to the session user's household (no cross-household writes).
- The household and `created_by` come from the session, never from the form.
- `reimbursement_pct` is copied from the item when the expense is created (frozen copy, per the data model).
- `budget_month` defaults to the first day of the month of `spent_on` and can be overridden (an expense counts toward a month independent of when it was paid).
- Money is integer CLP. The amount parser accepts digits with optional `.` thousands separators and rejects decimals, negatives and zero; max is the Postgres integer limit.
- Pure logic (parsing, validation, month math) lives in `src/lib/expenses.ts` and is unit tested. The write logic lives in `src/lib/expense-service.ts`, takes the database as a parameter, and has an integration test that runs only when `TEST_DATABASE_URL` is set (a throwaway local Postgres).
- Files that tests import use relative imports with `.ts` extensions so Node's native TypeScript support can run them.
- The page reads from the database inside `<Suspense>` (Cache Components is on); mutations call `revalidatePath("/expenses")`.
- UI copy is English; currency is formatted with the `es-CL` locale.

## Tasks

- [ ] 1. Pure logic (`src/lib/expenses.ts`): amount, dates, month, input validation, expected reimbursement, CLP format — test-first
- [ ] 2. Expense service (`src/lib/expense-service.ts`): household ownership checks, frozen pct, insert, list by month — test-first with an integration test on a throwaway Postgres
- [ ] 3. Server Action with session check, and the `/expenses` page (form + month list) with a link from the home page
- [ ] 4. README and close

## Commits

(one work-unit commit per task, recorded here)
