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

- T1 (S2): move `Modal` to `src/app/(app)/modal.tsx` and update the imports of `/categories` and `/savings`. Route: inline. Commit: pending.
- T2 (S3-S5): expenses: the form closes the modal itself, the page uses `Modal`, `expense-dialog.tsx` is deleted. Route: inline. Commit: pending.
- T3 (S3-S5): incomes, same. Route: inline. Commit: pending.
- T4 (S3-S5): transfers, same. Route: inline. Commit: pending.
- T5: independent verification by reading, build, close with a "Not verified" list. Route: inline plus one `gentle-ai-verify`. Commit: pending.

## Commits

(none yet)

## Log

- L1 (user): "las ventanas emergentes las podemos unificar después de ver lo de la deuda de los ahorros" and, later, "Haz la limpieza por favor y luego empecemos con el nuevo feature"

## Not verified

(to fill when the feature closes)
