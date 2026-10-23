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

- [x] 1. Pure logic (`src/lib/expenses.ts`): amount, dates, month, input validation, expected reimbursement, CLP format — test-first
- [x] 2. Expense service (`src/lib/expense-service.ts`): household ownership checks, frozen pct, insert, list by month — test-first with an integration test on a throwaway Postgres
- [x] 3. Server Action with session check, and the `/expenses` page (form + month list) with a link from the home page
- [x] 4. README and close

## Commits

(one work-unit commit per task, recorded here)

- Task 1: `bb7c2d8` feat: add expense parsing and validation helpers. RED (module not found), GREEN 15/15.
- Task 2: `7bd2630` feat: add expense service with household isolation. RED (module not found), GREEN 6/6 on a throwaway local Postgres with both migrations (`TEST_DATABASE_URL`): own-household insert, frozen percentage, item and account from another household rejected with no row inserted, month list scoped to household and month, newest first. The test cleans up after itself (0 leftover rows) and is skipped without `TEST_DATABASE_URL`.
- Task 3: `243198f` feat: add expenses page with form and month list. `shiftMonth` and `todayIn` (Santiago time zone, since the server runs in UTC) added test-first (RED: export missing, GREEN 18/18). tsc, lint, 33 unit tests, build PASS (`/expenses` is Partial Prerender). Dev server: unauthenticated GET and direct POST to `/expenses` redirect to `/login`.
- Task 4: `0b9595c` docs: document the expenses page and integration tests.

## Not verified

- The authenticated flow in a browser (submit the form, see the row, the month links, validation errors keeping what was typed): needs the user's Google session. The service is integration-tested, but the Server Action and the React form are only type-checked and built, not exercised.
- Server Action behavior with a session for a user whose household differs from the item's: covered at service level only.
