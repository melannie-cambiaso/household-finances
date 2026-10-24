# Feature: unify the modals

Goal: one modal component for the whole app instead of four near-identical copies, without changing how any modal looks or behaves.

Out of scope: any visible change, a new modal behavior, tests of the interface (there is no browser test setup).

Branch: `refactor/unify-modals`

## Specs

- S1: "las ventanas emergentes las podemos unificar" (user, L1)
- S2: The generic `Modal` of `/categories` is the one that stays; `ExpenseDialog`, `IncomeDialog` and `TransferDialog` are byte-for-byte the same file except for the form they wrap, so they go away.
- S3: Nothing changes for the user. Each modal keeps what the old dialogs did, which their code comments describe: it opens from its trigger button; it closes with the ✕ button, with Esc and with a click on the backdrop; dragging a text selection out of the modal and releasing over the backdrop does not close it; the form is remounted on every open, so it never shows a stale "saved" message or old errors; it closes after a successful save.
- S4: The trigger label, the trigger look and the title are chosen by each page, as before.
- S5: Add and edit still share one form, filled in when editing, as before.

## Design decisions (mine, not the user's; change them if you disagree)

- `Modal` and `useModalClose` move to `src/app/(app)/modal.tsx`, because more than one page uses them now. `/categories` and `/savings` change only their import.
- The expense, income and transfer forms close the modal with `useModalClose()` instead of an `onSuccess` prop, like the category forms already do. They are only used inside these dialogs, so no other caller changes.
- The three dialog files are deleted.

## Tasks

- T1 (S2): move `Modal` to `src/app/(app)/modal.tsx` and update the imports of `/categories` and `/savings`. Route: inline. Done, commit 99bc75e: git sees a pure rename; /categories and /savings only change their import; tsc and lint clean.
- T2 (S3-S5): expenses: the form closes the modal itself, the page uses `Modal`, `expense-dialog.tsx` is deleted. Route: inline. Done, commit 727013f: ExpenseForm closes the modal with useModalClose, the page renders Modal and ExpenseForm in both places (add and edit), expense-dialog.tsx deleted; tsc and lint clean, no reference left.
- T3 (S3-S5): incomes, same. Route: inline. Done, commit 8afb110: IncomeForm closes the modal with useModalClose, the page renders Modal and IncomeForm in both places, income-dialog.tsx deleted; tsc and lint clean, no reference left.
- T4 (S3-S5): transfers, same. Route: inline. Done, commit e64d2b3: TransferForm closes the modal with useModalClose, the page renders Modal and TransferForm in both places, transfer-dialog.tsx deleted; tsc and lint clean, no reference left.
- T5: independent verification by reading, build, close with a "Not verified" list. Route: inline plus one `gentle-ai-verify`. Done in the docs commit below: tsc, lint, build and the 113 unit tests pass; an unauthenticated GET of the five pages with modals answers 307 to /login; the independent verifier compared the old dialogs in git history with the new Modal and found S3, S4 and S5 preserved, with no behavior difference.

## Commits

- 99bc75e refactor: move the generic Modal to a shared file (T1)
- 727013f refactor: use the shared Modal on the expenses page (T2)
- 8afb110 refactor: use the shared Modal on the incomes page (T3)
- e64d2b3 refactor: use the shared Modal on the transfers page (T4)

## Log

- L1 (user): "las ventanas emergentes las podemos unificar después de ver lo de la deuda de los ahorros" and, later, "Haz la limpieza por favor y luego empecemos con el nuevo feature"

## Not verified

- Nothing was opened in a browser with a session. Only a browser confirms: that a click on the backdrop closes, that dragging a text selection out of the modal and releasing over the backdrop does not, that Esc closes, focus trapping, and that a form still closes by itself after a successful save on expenses, incomes and transfers.
- The structure changed in one detail the verifier flagged: the remount key now sits on a wrapper div around the form instead of on the form itself. React still remounts the whole subtree on every open, so a stale "saved" message or old errors should not appear, but this was not seen.
- No native review: assessed as medium risk, review not due.
