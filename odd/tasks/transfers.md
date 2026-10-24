# Feature: transfers

Goal: record, edit and delete transfers between the household's accounts from a page at `/transfers`, and show the savings debt whenever it is above zero.

Decision (user): "Transferencias + deuda" — the page with register, edit and delete, and the debt visible on the dashboard and on that page. Account balances are not part of this delivery.

Out of scope: account balances, transferring to or from an account not in the household, undo or history of changes, bulk edit.

Branch: `feat/transfers`

## Specs

- S1: "transfers: id, household_id, from_account_id, to_account_id, amount (integer), made_on (date), kind (enum `repayment` / `funding` / `other`)" (docs/data-model.md)
- S2: "A `funding` transfer (Salary → Utilities) moves money between accounts; it is **not an expense**, so it never counts against the budget. The actual utility bills are recorded as expenses paid from the Utilities account." (docs/data-model.md)
- S3: "Only `repayment` transfers into a `savings` account reduce the debt. The debt is always visible in the UI whenever it is above zero." (docs/data-model.md)
- S4: "Savings debt = sum(expenses.amount WHERE account.kind = 'savings') - sum(transfers.amount WHERE kind = 'repayment' AND to = a savings account)" (docs/data-model.md)
- S5: "Savings debt: A **derived balance**, never stored: every expense paid from a savings account minus repayments. No flag, no exceptions (emergencies are repaid too)." (docs/data-model.md)
- S6: "Money: Stored as integer amounts (no floats). Assumes a currency without decimals (CLP)." (docs/data-model.md)
- S7: The database already enforces `amount > 0` and `from_account_id <> to_account_id` on transfers.

## Design decisions (mine, not the user's; change them if you disagree)

- The month list uses the calendar month of `made_on`: transfers have no budget month and no author column.
- A `repayment` must go into a savings account. The model says only those reduce the debt (S3); accepting a repayment anywhere else would be a silent no-op, so it is refused with a clear message.
- Source and destination accounts must belong to the household and be different (S7), with friendly errors before the database check.
- The debt can be negative when more was repaid than spent from savings; it is reported as is and shown only when above zero (S3).
- Edit and delete follow the same model as expenses and incomes: scoped by id and household, no undo, delete asks for a browser confirmation. Transfers never touch the budget (S2).
- The debt appears on the dashboard (a card) and at the top of `/transfers`, both only when above zero.
- Same security model as the other pages: the Server Actions re-check the session; the household comes from the session, never the form.
- Pure logic in `src/lib/transfers.ts` (reusing helpers from `src/lib/expenses.ts`), service in `src/lib/transfer-service.ts`, integration tests gated by `TEST_DATABASE_URL`. UI copy in English.

## Tasks

- [x] 1. Pure logic (`src/lib/transfers.ts`): input validation (distinct accounts, kind, amount, date) — test-first (S1, S6, S7)
- [ ] 2. Transfer service: create, get, update, delete, list by month; household and repayment rules — test-first with integration test (S1, S3, S7)
- [ ] 3. Savings debt query — test-first with integration test (S3, S4, S5)
- [ ] 4. Server Actions and the `/transfers` page (form and modal, list, edit, delete, debt banner) with a sidebar entry
- [ ] 5. Debt card on the dashboard
- [ ] 6. README and close

## Commits

(one work-unit commit per task, recorded here)

## Log

- L1 (user): "haz la limpieza y sigamos con la siguiente feature" — after the assistant listed "transferencias y deuda de ahorros" as what remained of the original idea.
- L2 (user): chose "Transferencias + deuda" as the scope: the `/transfers` page with register, edit and delete, and the debt visible on the dashboard and on that page whenever it is above zero.
