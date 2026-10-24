# Feature: edit-delete

Goal: correct a mistake in an expense or an income, or remove one, from the existing `/expenses` and `/incomes` lists.

Out of scope: undo, an audit trail of changes, bulk edit/delete, editing or deleting budget lines outside the budget page, transfers and savings debt.

Branch: `feat/edit-delete`

## Specs

- S1: "hagamos eso: editar y borrar gastos e ingresos" (user, L1).
- S2: "Si borrás un gasto que tiene ingresos de reembolso vinculados, ¿qué hacemos con esos ingresos?" -> user chose "Desvincular y conservar": the expense is deleted and the incomes stay as ordinary incomes with no related expense (user, L2).
- S3: "Frozen percentage: `reimbursement_pct` is copied from the item into the expense when it is created, so later changes never rewrite history." (docs/data-model.md)
- S4: "Pending reimbursement: expected - sum(incomes.amount WHERE related_expense_id = expense.id)" (docs/data-model.md)
- S5: "Expenses and incomes can be recorded in any state." (docs/data-model.md, about budget months: confirmed or draft)

## Design decisions (mine, not the user's; change them if you disagree)

- Edit and delete work in any month and with any budget state, including a confirmed budget (S5): the budget locks its planned lines, not the actual records.
- Edit keeps `created_by`. Only rows of the session's household can be changed: every update and delete is scoped by id and household.
- Editing an expense keeps its frozen reimbursement percentage (S3). The percentage is re-copied only when the item is changed, from the new item.
- An expense cannot become non-reimbursable (new item without a percentage) while incomes are linked to it: the edit is refused.
- Editing an income applies the same rules as creating one (source, account and related expense must belong to the household; only a reimbursement source can be linked, only to a reimbursable expense).
- Deleting an expense unlinks its incomes and deletes it in one transaction (S2); deleting an income just deletes it.
- UI: the existing form opens in the modal, pre-filled, from a button on each row; delete asks for a browser confirmation first. Server Actions re-check the session; household and author come from the session, never the form.
- Services take the database as a parameter and have integration tests gated by `TEST_DATABASE_URL`. UI copy in English.

## Tasks

- [x] 1. Expense service: get one, update (frozen percentage rules) and delete (unlink incomes) — test-first with integration test (S2, S3)
- [x] 2. Income service: get one, update and delete — test-first with integration test (S4)
- [x] 3. Expenses page: edit and delete from each row
- [x] 4. Incomes page: edit and delete from each row
- [x] 5. README and close

## Commits

(one work-unit commit per task, recorded here)
- Task 1: `3875c51` feat: edit and delete expenses in the expense service. RED (deleteExpense not exported), GREEN 14/14 on the Neon branch copy (the 6 existing tests still pass, 8 new): get only within the household; update keeps the author and the frozen percentage (even after the item's percentage changed); changing the item re-freezes from the new item; item/account from another household rejected with the row unchanged; another household's expense cannot be updated; making an expense non-reimbursable while incomes are linked is refused; delete keeps the linked incomes as plain incomes (S2); another household's expense and its link survive a delete attempt. Full suite 105/105, tsc and lint clean, 0 leftover rows.
- Task 2: `ff388f9` feat: edit and delete incomes in the income service. RED (deleteIncome not exported). `createIncome` refactored so creating and editing share one rule check (`checkIncomeTargets`); its 9 existing tests are the proof that creation still behaves the same. GREEN 16/16 on the Neon branch copy (9 existing + 7 new): get only within the household; update keeps the author; link and unlink a reimbursement changes what is pending (30.000 received -> 40.000 pending, unlinked -> 70.000); the five creation rules refuse an edit and leave the row unchanged; another household's income cannot be updated or deleted; deleting a linked income makes its expense pending again. Full suite 112/112, tsc and lint clean, 0 leftover rows.
- Task 3: `d08217f` feat: edit and delete expenses from the expenses page. The list now returns item, account and month; `updateExpenseAction` and `deleteExpenseAction` re-check the session; the expense form and the modal serve both adding and editing (`ExpenseDialog`, ids made unique with `useId` since each row has its own modal); delete asks for a browser confirmation. tsc, lint, 112 tests and build PASS. Unauthenticated GET and a fake direct POST to `/expenses` redirect to `/login` (that POST is stopped by the access proxy, so it does not exercise the action's own session check). The UI itself (pre-filled modal, delete confirmation, error messages) is not exercised with a session.
- Task 4: `8c1ec8e` feat: edit and delete incomes from the incomes page. The list now returns source, account, month and the label of the linked expense (added test-first: RED, then GREEN 17/17 on the Neon branch copy; the existing list test still passes), so the edit form can offer the linked expense even when it is settled and no longer pending. `updateIncomeAction` and `deleteIncomeAction` re-check the session; the income form and modal serve both adding and editing (`IncomeDialog`); delete asks for a browser confirmation. tsc, lint, 113 tests and build PASS; unauthenticated GET and a fake POST to `/incomes` redirect to `/login` (stopped by the access proxy, not by the action itself). The UI (pre-filled modal, the settled expense in the selector, delete confirmation) is not exercised with a session.

## Log

- L1 (user): "hagamos eso: editar y borrar gastos e ingresos" — after the assistant recommended it as the next feature because today a typo cannot be corrected.
- L2 (user): chose "Desvincular y conservar" for deleting an expense that has linked reimbursement incomes.

## Not verified

- The authenticated flow in a browser: open Edit pre-filled, save a change, see the error messages, delete with the confirmation, and edit an income whose linked expense is already settled. Needs the user's Google session. The services under the screens are integration-tested; the Server Actions, forms, modals and pages are only type-checked, built and checked for the unauthenticated redirect.
- The access check of `updateExpenseAction`, `deleteExpenseAction`, `updateIncomeAction` and `deleteIncomeAction` on their own: the fake POST used to probe them is stopped by the access proxy before it reaches the action.
- Delete failures are only logged, and the page shows no message.
- Concurrent edits of the same record (two people saving the same expense at once): the last save wins, and the row lock only serializes them.
- The integration tests ran against a Neon branch copy, not a local Postgres.
