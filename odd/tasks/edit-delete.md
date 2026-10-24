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
- [ ] 2. Income service: get one, update and delete — test-first with integration test (S4)
- [ ] 3. Expenses page: edit and delete from each row
- [ ] 4. Incomes page: edit and delete from each row
- [ ] 5. README and close

## Commits

(one work-unit commit per task, recorded here)

## Log

- L1 (user): "hagamos eso: editar y borrar gastos e ingresos" — after the assistant recommended it as the next feature because today a typo cannot be corrected.
- L2 (user): chose "Desvincular y conservar" for deleting an expense that has linked reimbursement incomes.
