import { formatClp } from "@/shared/money";
import { perMonthNeeded } from "@/features/savings-goals/rules";
import type { GoalWithProgress } from "@/features/savings-goals/service";
import { TransferForm } from "@/features/transfers/transfer-form";
import { Modal } from "@/shared/ui/modal";

import { ArchiveGoalButton } from "./archive-goal-button";
import { GoalForm } from "./goal-form";

type AccountOption = { id: string; name: string };
type GoalOption = { id: string; name: string };

const primaryButtonClass =
  "rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90";

const rowButtonClass =
  "rounded-full border border-line px-3 py-0.5 text-sm text-muted transition-colors hover:bg-page hover:text-text";

function ProgressBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-page"
    >
      <div
        className="h-full rounded-full bg-income"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// One active goal: what was contributed against the target, and the three things
// the household can do with it. Contributing opens the transfer form with the
// goal already chosen, so it is an ordinary transfer that lands in savings.
function GoalCard({
  goal,
  today,
  accounts,
  savingsAccounts,
  goalOptions,
}: {
  goal: GoalWithProgress;
  today: string;
  accounts: AccountOption[];
  savingsAccounts: AccountOption[];
  goalOptions: GoalOption[];
}) {
  const { contributed, remaining, overshoot, pct, achieved } = goal.progress;
  const perMonth =
    goal.targetDate !== null && !achieved
      ? perMonthNeeded(today, goal.targetDate, remaining)
      : null;

  return (
    <li className="rounded-2xl border border-line px-4 py-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg">{goal.name}</h3>
          <p className="text-sm text-muted">
            <span className="font-numeric">{formatClp(contributed)}</span> of{" "}
            <span className="font-numeric">{formatClp(goal.targetAmount)}</span>
            {goal.targetDate !== null && <> · by {goal.targetDate}</>}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {savingsAccounts.length > 0 && (
            <Modal
              triggerLabel="Contribute"
              triggerClassName={rowButtonClass}
              title={`Contribute to ${goal.name}`}
            >
              <TransferForm
                accounts={accounts}
                toAccounts={savingsAccounts}
                goals={goalOptions}
                presetGoalId={goal.id}
                presetKind="funding"
                today={today}
              />
            </Modal>
          )}
          <Modal
            triggerLabel="Edit"
            triggerClassName={rowButtonClass}
            title={`Edit ${goal.name}`}
          >
            <GoalForm
              goal={{
                id: goal.id,
                values: {
                  name: goal.name,
                  targetAmount: String(goal.targetAmount),
                  targetDate: goal.targetDate ?? "",
                },
              }}
            />
          </Modal>
          <ArchiveGoalButton goalId={goal.id} className={rowButtonClass} />
        </div>
      </div>

      <ProgressBar label={`${goal.name}: ${pct}% saved`} pct={pct} />

      <div className="mt-2 text-sm text-muted">
        {achieved ? (
          <p>
            Reached
            {overshoot > 0
              ? `, ${formatClp(overshoot)} over the target`
              : ""}
            .
          </p>
        ) : (
          <>
            <p>{formatClp(remaining)} to go.</p>
            {perMonth !== null && perMonth > 0 && (
              <p>Save {formatClp(perMonth)} per month to get there.</p>
            )}
            {perMonth === null && (
              <p className="text-expense">The target date has passed.</p>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/**
 * The Goals half of /savings. Progress is derived on the server from the
 * transfers linked to each goal, so nothing here needs to be kept in sync.
 */
export function GoalsSection({
  goals,
  accounts,
  savingsAccounts,
  today,
}: {
  goals: GoalWithProgress[];
  // Every account, because a contribution can come from any of them.
  accounts: AccountOption[];
  // Only the savings accounts can receive a contribution.
  savingsAccounts: AccountOption[];
  today: string;
}) {
  const active = goals.filter((goal) => goal.archivedAt === null);
  const archived = goals.filter((goal) => goal.archivedAt !== null);
  const goalOptions = active.map((goal) => ({ id: goal.id, name: goal.name }));

  return (
    <section className="rounded-card border border-line bg-surface p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {active.length === 0
            ? "No active goals yet."
            : `${active.length} active`}
          {archived.length > 0 && ` · ${archived.length} archived`}
        </p>
        <Modal
          triggerLabel="+ Add goal"
          triggerClassName={primaryButtonClass}
          title="Add a savings goal"
        >
          <GoalForm />
        </Modal>
      </div>

      {active.length > 0 && (
        <ul className="flex flex-col gap-3">
          {active.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              today={today}
              accounts={accounts}
              savingsAccounts={savingsAccounts}
              goalOptions={goalOptions}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="mb-2 text-lg">Archived</h3>
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {archived.map((goal) => (
              <li
                key={goal.id}
                className="flex flex-wrap justify-between gap-2"
              >
                <span>{goal.name}</span>
                <span className="font-numeric">
                  {formatClp(goal.progress.contributed)} of{" "}
                  {formatClp(goal.targetAmount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
