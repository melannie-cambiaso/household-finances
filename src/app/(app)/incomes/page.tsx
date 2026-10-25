import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import { listAccounts } from "@/lib/expense-service";
import { formatClp } from "@/shared/money";
import { formatMonthLabel, parseMonthParam, shiftMonth, todayIn } from "@/shared/dates";
import {
  listIncomes,
  listIncomeSources,
  listPendingReimbursements,
} from "@/lib/income-service";
import { getAllowedSession } from "@/lib/session";

import { Modal } from "../modal";
import { DeleteIncomeButton } from "./delete-income-button";
import { IncomeForm } from "./income-form";

const TIME_ZONE = "America/Santiago";

type SearchParams = Promise<{ month?: string | string[] }>;

const pillClass =
  "rounded-full border border-line px-4 py-1 text-sm text-muted transition-colors hover:bg-surface hover:text-text";

const rowButtonClass =
  "rounded-full border border-line px-3 py-0.5 text-sm text-muted transition-colors hover:bg-page hover:text-text";

export default function IncomesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <IncomesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function IncomesContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  const householdId = session.user.householdId;
  if (!householdId) {
    return <p className="p-8">Your account is not linked to a household.</p>;
  }

  // The current date is read after the session, which makes this render dynamic.
  const today = todayIn(TIME_ZONE);
  const { month: monthParam } = await searchParams;
  const month = parseMonthParam(
    typeof monthParam === "string" ? monthParam : undefined,
    today,
  );

  const [sources, accounts, incomes, pending] = await Promise.all([
    listIncomeSources(db, householdId),
    listAccounts(db, householdId),
    listIncomes(db, householdId, month),
    listPendingReimbursements(db, householdId),
  ]);

  const total = incomes.reduce((sum, income) => sum + income.amount, 0);
  const pendingTotal = pending.reduce((sum, row) => sum + row.pending, 0);
  const pendingOptions = pending.map((row) => ({
    id: row.id,
    label: `${row.categoryName} / ${row.itemName} · ${row.spentOn} · pending ${formatClp(row.pending)}`,
  }));

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-8 py-6">
        <div>
          <h1 className="text-3xl">Incomes</h1>
          <p className="text-sm text-muted">What the household received</p>
        </div>
        <nav aria-label="Month" className="flex items-center gap-3">
          <Link
            href={`/incomes?month=${shiftMonth(month, -1).slice(0, 7)}`}
            className={pillClass}
          >
            ← Previous
          </Link>
          <span className="min-w-36 text-center text-xl">
            {formatMonthLabel(month)}
          </span>
          <Link
            href={`/incomes?month=${shiftMonth(month, 1).slice(0, 7)}`}
            className={pillClass}
          >
            Next →
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
        {sources.length === 0 || accounts.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-6 text-muted">
            There are no income sources or accounts yet. Run{" "}
            <code className="rounded bg-page px-1">pnpm db:seed</code> to add
            sample ones.
          </p>
        ) : (
          <div className="flex justify-end">
            <Modal
              triggerLabel="+ Add income"
              triggerClassName="rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90"
              title="Add an income"
            >
              <IncomeForm
                sources={sources}
                accounts={accounts}
                pending={pendingOptions}
                today={today}
              />
            </Modal>
          </div>
        )}

        <section className="rounded-card border border-line bg-surface p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl">{formatMonthLabel(month)}</h2>
            <p className="text-muted">
              Total{" "}
              <span className="font-numeric text-lg font-bold text-income">
                {formatClp(total)}
              </span>
            </p>
          </div>

          {incomes.length === 0 ? (
            <p className="text-muted">No incomes for this month.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {incomes.map((income) => {
                // The expense this income already covers must stay selectable
                // when editing, even if it is settled and no longer pending.
                const linkedMissing =
                  income.relatedExpenseId !== null &&
                  !pendingOptions.some((o) => o.id === income.relatedExpenseId);
                const options =
                  linkedMissing && income.relatedExpenseId
                    ? [
                        {
                          id: income.relatedExpenseId,
                          label: `${income.relatedExpenseCategory} / ${income.relatedExpenseItem} · ${income.relatedExpenseDate} · settled`,
                        },
                        ...pendingOptions,
                      ]
                    : pendingOptions;

                return (
                  <li
                    key={income.id}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-line px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p>{income.sourceName}</p>
                      <p className="text-sm text-muted">
                        {income.receivedOn} · {income.accountName}
                        {income.relatedExpenseId && " · linked to an expense"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-numeric font-bold text-income">
                        {formatClp(income.amount)}
                      </p>
                      <div className="mt-2 flex justify-end gap-2">
                        <Modal
                          triggerLabel="Edit"
                          triggerClassName={rowButtonClass}
                          title="Edit income"
                        >
                          <IncomeForm
                            sources={sources}
                            accounts={accounts}
                            pending={options}
                            today={today}
                            income={{
                              id: income.id,
                              values: {
                                incomeSourceId: income.incomeSourceId,
                                accountId: income.accountId,
                                amount: String(income.amount),
                                receivedOn: income.receivedOn,
                                // The month input takes YYYY-MM.
                                budgetMonth: income.budgetMonth.slice(0, 7),
                                relatedExpenseId: income.relatedExpenseId ?? "",
                              },
                            }}
                          />
                        </Modal>
                        <DeleteIncomeButton
                          incomeId={income.id}
                          className={rowButtonClass}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-line bg-surface p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl">Pending reimbursements</h2>
            <p className="text-muted">
              Owed{" "}
              <span className="font-numeric text-lg font-bold text-income">
                {formatClp(pendingTotal)}
              </span>
            </p>
          </div>

          {pending.length === 0 ? (
            <p className="text-muted">Nothing pending.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {pending.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-line px-4 py-3"
                >
                  <div className="min-w-0">
                    <p>
                      {row.categoryName} / {row.itemName}
                    </p>
                    <p className="text-sm text-muted">
                      {row.spentOn} · {formatClp(row.amount)} at{" "}
                      {row.reimbursementPct}%
                      {row.description && ` · ${row.description}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-numeric font-bold text-income">
                      {formatClp(row.pending)}
                    </p>
                    {row.received > 0 && (
                      <p className="text-sm text-muted">
                        {formatClp(row.received)} of {formatClp(row.expected)}{" "}
                        received
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
