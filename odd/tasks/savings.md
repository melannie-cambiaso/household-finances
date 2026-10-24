# Feature: savings

Goal: a `/savings` page that shows how much the household has saved today and the history of what came in and went out of its savings accounts.

Decision (user): "Saldo y movimientos" (not goals), and the balance starts from an opening amount the user types once: "Lo cargo yo una vez".

Out of scope: savings goals, projections, editing past movements from this page, balances for the Salary and Utilities accounts.

Branch: `feat/savings`

## Specs

- S1: "Account balance: sum(incomes) - sum(expenses) +/- transfers, per account" (docs/data-model.md)
- S2: "accounts: id, household_id, name (e.g. \"Salary\", \"Savings\", \"Utilities\"), kind (enum `salary` / `savings` / `utilities`)" (docs/data-model.md)
- S3: "Savings debt: A **derived balance**, never stored" (docs/data-model.md). The saved balance follows the same rule: it is computed on every visit; only the opening amount and its date are stored.
- S4: "Money: Stored as integer amounts (no floats). Assumes a currency without decimals (CLP)." (docs/data-model.md)
- S5: Opening balance, from the user: "Lo cargo yo una vez". The user types how much was saved and from which date; the balance is that amount plus every movement dated after it.
- S6: Movements of a savings account: incomes received into it, transfers into it, transfers out of it, and expenses paid from it.
- S7: The existing savings debt (expenses from savings minus repayments) is untouched.

## Design decisions (mine, not the user's; change them if you disagree)

- The opening amount and date are two optional columns on `accounts`. Optional keeps the migration additive: no existing row changes and the deployed app keeps working while it is applied.
- The opening amount may be zero but not negative; the date cannot be in the future.
- Only movements dated **after** the opening date count. A movement on the opening date itself is assumed to be already inside the typed amount.
- With several savings accounts each has its own balance, and the page shows their sum on top.
- A savings account without an opening amount shows no balance, only a prompt to set it.
- The history is shown one calendar month at a time, like the other pages, with the balance at the start and the end of that month.
- A transfer between two savings accounts moves money inside the total: it is a movement of each account, but not of the sum.

## Tasks

- T1 (S3, S4, S5): pure logic in `src/lib/savings.ts`: opening-balance validation, merging movements, balance and running balance. Route: inline, test-first. Done, commit 3f2d073 (15 tests: RED seen as module-not-found, then GREEN; tsc and lint clean).
- T2 (S2, S5): additive migration with `opening_balance` and `opening_balance_on` on `accounts`. Applying it to the real database needs the user's explicit OK. Route: inline. File generated and committed in 9a68c4c, NOT applied to any database yet (see Not verified); tsc clean.
- T3 (S1, S5, S6, S7): `src/lib/savings-service.ts`: set the opening balance, balance per account, movements for a month. Integration tests. Route: inline, test-first. Done, commit 3d311da: 15 integration tests plus 5 for the pure currentBalance, RED seen first (module not found); against the Neon test branch with 0002 applied there; full suite 205/205, tsc and lint clean; test data cleaned up.
- T4 (S5, S6): Server Action, `/savings` page and sidebar entry. Route: inline. Done, commit c1e4981: tsc, lint and build pass; /savings is Partial Prerender; an unauthenticated GET, GET with a month and a fake direct POST all answer 307 to /login. NOT seen in a browser with a session.
- T5: README section, `docs/data-model.md`, close with a "Not verified" list. Route: inline. Done in the docs commit below: README section, `docs/data-model.md` (two columns and the savings balance formula).

## Commits

- 3f2d073 feat: add pure savings balance and statement logic (T1)
- 9a68c4c feat: add optional opening balance columns to accounts (T2)
- 3d311da feat: derive savings balances and monthly statements (T3)
- c1e4981 feat: add the savings page with opening balance and monthly statement (T4)

## Log

- L1 (user): "quiero que hagamos otro módulo para trackear los ahorros"
- L2 (user): chose "Saldo y movimientos" for the scope.
- L3 (user): chose "Lo cargo yo una vez" for the starting point of the balance.

## Not verified

- Migration 0002 is applied only to the Neon test branch. It is NOT applied to the real database: until it is, the new code cannot read `accounts` there. It has to be applied before merging, with the user's explicit OK.
- The page was never opened in a browser with a session: how it looks, the modal, the form messages (invalid amount, future date) and the month navigation are unseen.
- The action's own session check was not exercised: the fake POST is stopped by the access proxy first.
- Reading `accounts` now selects two more columns in every module; the full suite passes against the test branch, but the real database has not been touched.
- No native review: assessed as medium risk, review not due.
