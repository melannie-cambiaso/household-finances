# Savings goals

Goals the household saves toward (e.g. "Emergency fund"), shown as a section of `/savings`. Option A approved: contributions are real transfers linked to a goal, progress is computed, never stored.

## Specs

- S1: "podríamos actualizar el README y después planear como haríamos el tema de las metas de ahorro" — the README drift fix ("transfers between accounts cannot be recorded yet") ships as its own docs commit.
- S2: "vamos con la opción A" — contributions are transfers: add `goal_id uuid null` to `transfers`; a goal contribution is money that really moved into a savings account; progress = `sum(transfers.amount WHERE goal_id = goal.id)`, computed on every visit, never stored.
- S3: `savings_goals` table: `id`, `household_id`, `name`, `target_amount` (integer CLP), `target_date` (nullable), `archived_at` (nullable). "Achieved" is derived from progress, not stored.
- S4: A transfer with `goal_id` set must land in a `savings` account (same rule as repayment). Editing/deleting a goal transfer follows the existing transfer rules.
- S5: UI: "Metas" section inside `/savings` (no new page, `NAV_ITEMS` unchanged): each goal with a progress bar (contributed vs. target), optional target date, add / contribute / edit / archive. Contributing reuses the transfer form with the goal preselected. Savings balances and the savings debt are unchanged by goals.
- S6: Tests: service tests with the throwaway Postgres (same pattern as expenses/incomes) cover computed progress, archived goals excluded from active totals, and that a contribution affects the `/savings` balance exactly once.

## Tasks

- T1 (S2,S3): schema `savings_goals` + `transfers.goal_id`, migration generated and applied. Commit: feat schema.
- T2 (S3,S2): goals service (create, rename/edit target, archive, list with computed progress) + unit/service tests. Commit: feat service.
- T3 (S4,S2,S6): goal contributions through the transfer service (validation: goal transfers land in a savings account) + tests. Commit: feat contributions. — DONE
- T4 (S5): `/savings` UI section with progress bars and add/contribute/edit/archive actions. Commit: feat UI. — DONE
- T5 (S1): docs — README savings-goals section and `docs/data-model.md` (entities, transfers.goal_id, derived progress). Commit: docs. — DONE

## Delivery

The branch is one feature of five tasks. Measured before the last commit (lock files excluded), so the PRs can follow these boundaries:

| Slice | Commits | Changed lines |
| --- | --- | --- |
| Schema and goals service (T1, T2) | `a0307d0`, `d7adec5` | ~1980, most of it the generated migration |
| Contributions through transfers (T3) | `38bef15` | 227 |
| Goals UI and goal select (T4) | `62ba2e6` | 728 |
| Docs (T5) | this commit | ~150 |

Proposed chain: T1+T2, then T3, then T4+T5. Opening the pull requests is the user's decision, not part of the feature work.

## Log

- L1: "podríamos actualizar el README y después planear como haríamos el tema de las metas de ahorro" — README dashboard line fixed (uncommitted at the time); plan presented.
- L2: "vamos con la opción A" — approved the plan above. Refinement within the approved philosophy ("derived, never stored"): goal status is `archived_at` (null = active) instead of a stored `achieved` enum value; achieved is derived from progress.
- L3: "quiero que dejemos este feature hasta acá porque me quiero dormir" — stopped mid-T3 by the user. State: T1 (`a0307d0`) and T2 (`d7adec5`) committed; T3 uncommitted in the working tree with RED→GREEN partially applied. Remaining to finish T3: (1) add `goalId: null` to the two TransferInput literals in `src/features/transfers/service.test.ts` (lines ~55 and ~203), (2) add `goalId` to the `TransferFormValues` literal in `src/features/transfers/transfers-page.tsx` (~line 186), (3) decide whether the edit form gets the goal select now or in T4, (4) add the integration tests for goal contributions (rejected into non-savings, archived goal, unknown goal) in `transfers/service.test.ts`, then tsc + eslint + pnpm test and commit as T3.
- L4: T3 finished. Found and fixed a real bug in the unfinished code: the active-goal lookup used `eq(archivedAt, sql\`null\`)`, which renders `archived_at = null` and never matches, so every contribution would have been rejected with `goal_not_found`; now `isNull()`. Verified by reverting it: the accept test goes red. Also fixed a silent data loss: the edit form had no `goalId` field, so saving an edit would unlink the goal; a hidden input preserves it until T4 renders the select (decision 3 above: the select is T4's, the preservation is T3's). Decisions: goal rejection messages stay uniform (`goal_not_found`) for missing, foreign and archived goals so the id is not probed; a contribution counts in `getSavingsNetEffect` once and pays no debt (it is `funding`, not `repayment`). Verification: new disposable Neon branch because the old `TEST_DATABASE_URL` endpoint no longer authenticated; migration `0004` applied there; 41/41 transfer tests green including the 5 new ones; tsc 0 errors; eslint clean.
- L5: T4 finished. `savings-goals/{actions,goal-form,archive-goal-button,goals-section}.tsx` plus the section wired into `/savings`: each active goal shows contributed vs. target with a progress bar, the target date and, when set, what to put aside per month (`perMonthNeeded`, until now unused), with add / contribute / edit / archive; archived goals are listed apart with their contributed total. Decisions: (1) the section is titled "Goals", not "Metas": S5 uses the user's Spanish word for the concept, and every other label in the app is English; (2) a contribution opens the transfer form with the goal preselected and the kind defaulted to `funding`, "To" limited to savings accounts and "From" open to every account, because money is put aside from salary into savings; (3) the transfer form gained an optional goal select on `/transfers` (create and edit); an edited transfer whose goal is archived keeps it through an extra "Archived goal" option instead of silently unlinking it; (4) `transfers/actions.ts` now revalidates `/savings`, so a contribution updates the balance and the progress at once; (5) transfer rows show the goal they feed (the `goalName` joined in T3). Verification: tsc 0 errors, eslint clean, `next build` ok, `node --test "src/**/*.test.ts"` 144 pass; the Postgres suites skip without `TEST_DATABASE_URL`, and T4 adds no database code, so the UI was not exercised against a database.
- L6: T5 finished. README: the Savings intro now mentions what is being saved toward, the old "savings goals are not part of this page" line is gone, and a "Savings goals" subsection covers contributions being real transfers, derived progress, archive-instead-of-delete and the optional goal field on `/transfers`. `docs/data-model.md`: a decision row for goals, `savings_goals` in the entity diagram and as its own table (`target_date`, `archived_at`, no `achieved`, no delete), `transfers.goal_id`, the rule that a contribution must land in a savings account, and the three derived values (progress, achieved and what is left per month). Delivery boundaries recorded above for the PR chain.
