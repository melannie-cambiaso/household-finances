import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import { getBudgetMonth, getBudgetProgress } from "@/lib/budget-service";
import {
  formatClp,
  formatMonthLabel,
  parseMonthParam,
  shiftMonth,
  todayIn,
} from "@/lib/expenses";
import { listPendingReimbursements } from "@/lib/income-service";
import { getSavingsDebt } from "@/lib/transfer-service";
import { debtStanding } from "@/lib/transfers";
import { getAllowedSession } from "@/lib/session";

import { Bar, Figures } from "./budget/progress-section";

const TIME_ZONE = "America/Santiago";

type SearchParams = Promise<{ month?: string | string[] }>;

const pillClass =
  "rounded-full border border-line px-4 py-1 text-sm text-muted transition-colors hover:bg-surface hover:text-text";

const cardClass = "rounded-card border border-line bg-surface p-6";

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

// Without a budget there is nothing to compare with, so showing "over by" would
// be misleading: only the real amount is shown.
function ActualOnly({ label, amount }: { label: string; amount: number }) {
  return (
    <p>
      <span className="font-numeric text-2xl font-bold">
        {formatClp(amount)}
      </span>{" "}
      <span className="text-sm text-muted">
        {label.toLowerCase()} · no budget to compare with
      </span>
    </p>
  );
}

async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
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

  const [report, budget, pending, debt] = await Promise.all([
    getBudgetProgress(db, householdId, month),
    getBudgetMonth(db, householdId, month),
    listPendingReimbursements(db, householdId),
    getSavingsDebt(db, householdId),
  ]);
  const standing = debtStanding(debt);

  const income = report.incomeTotal;
  const spending = report.expenseTotal;
  // Money in minus money out for the month. It is not an account balance:
  // transfers between accounts are not recorded yet.
  const net = income.actual - spending.actual;
  const pendingTotal = pending.reduce((sum, row) => sum + row.pending, 0);
  const monthLabel = formatMonthLabel(month);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-8 py-6">
        <div>
          <h1 className="text-3xl">Dashboard</h1>
          <p className="text-sm text-muted">
            Signed in as {session.user.email}
          </p>
        </div>
        <nav aria-label="Month" className="flex items-center gap-3">
          <Link
            href={`/?month=${shiftMonth(month, -1).slice(0, 7)}`}
            className={pillClass}
          >
            ← Previous
          </Link>
          <span className="min-w-36 text-center text-xl">{monthLabel}</span>
          <Link
            href={`/?month=${shiftMonth(month, 1).slice(0, 7)}`}
            className={pillClass}
          >
            Next →
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid w-full max-w-3xl gap-6 p-8 md:grid-cols-2">
        {/* Always visible while it is not zero, whatever month is shown. */}
        {standing.kind === "credit" && (
          <section
            role="status"
            className="rounded-card border border-income bg-surface p-6 md:col-span-2"
          >
            <h2 className="mb-1 text-xl">Savings credit</h2>
            <p>
              <span className="font-numeric text-3xl font-bold text-income">
                {formatClp(standing.amount)}
              </span>{" "}
              <span className="text-muted">
                more repaid to savings than was spent from them. Well done!
              </span>
            </p>
          </section>
        )}
        {standing.kind === "debt" && (
          <section
            role="status"
            className="rounded-card border border-expense bg-surface p-6 md:col-span-2"
          >
            <h2 className="mb-1 text-xl">Savings debt</h2>
            <p>
              <span className="font-numeric text-3xl font-bold text-expense">
                {formatClp(standing.amount)}
              </span>{" "}
              <span className="text-muted">still to repay to savings</span>
            </p>
            <Link href="/transfers" className="mt-4 inline-block text-sm underline">
              Register a repayment
            </Link>
          </section>
        )}

        <section className={cardClass}>
          <h2 className="mb-3 text-xl">Income</h2>
          {budget ? (
            <div className="grid gap-1">
              <Figures progress={income} tone="income" />
              <Bar progress={income} tone="income" />
            </div>
          ) : (
            <ActualOnly label="Received" amount={income.actual} />
          )}
          <Link
            href={`/incomes?month=${month.slice(0, 7)}`}
            className="mt-4 inline-block text-sm underline"
          >
            See incomes
          </Link>
        </section>

        <section className={cardClass}>
          <h2 className="mb-3 text-xl">Spending</h2>
          {budget ? (
            <div className="grid gap-1">
              <Figures progress={spending} tone="expense" />
              <Bar progress={spending} tone="expense" />
            </div>
          ) : (
            <ActualOnly label="Spent" amount={spending.actual} />
          )}
          <Link
            href={`/expenses?month=${month.slice(0, 7)}`}
            className="mt-4 inline-block text-sm underline"
          >
            See expenses
          </Link>
        </section>

        <section className={cardClass}>
          <h2 className="mb-1 text-xl">Net of the month</h2>
          <p
            className={`font-numeric text-3xl font-bold ${net < 0 ? "text-expense" : "text-income"}`}
          >
            {net < 0 && "-"}
            {formatClp(Math.abs(net))}
          </p>
          <p className="mt-1 text-sm text-muted">
            Received minus spent in {monthLabel}. This is not an account
            balance.
          </p>
        </section>

        <section className={cardClass}>
          <h2 className="mb-2 text-xl">Budget</h2>
          {!budget ? (
            <>
              <p className="text-muted">No budget for {monthLabel} yet.</p>
              <Link
                href={`/budget?month=${month.slice(0, 7)}`}
                className="mt-4 inline-block text-sm underline"
              >
                Create it
              </Link>
            </>
          ) : (
            <>
              <p>
                <span className="rounded-full border border-line px-3 py-1 text-sm">
                  {budget.status === "confirmed" ? "Confirmed" : "Draft"}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted">
                {budget.status === "confirmed"
                  ? "Locked: its planned lines can no longer change."
                  : "Still editable until you confirm it."}
              </p>
              <Link
                href={`/budget?month=${month.slice(0, 7)}`}
                className="mt-4 inline-block text-sm underline"
              >
                Open the budget
              </Link>
            </>
          )}
        </section>

        <section className={`${cardClass} md:col-span-2`}>
          <h2 className="mb-1 text-xl">Pending reimbursements</h2>
          {pending.length === 0 ? (
            <p className="text-muted">Nothing pending.</p>
          ) : (
            <p>
              <span className="font-numeric text-3xl font-bold text-income">
                {formatClp(pendingTotal)}
              </span>{" "}
              <span className="text-muted">
                still owed on {pending.length}{" "}
                {pending.length === 1 ? "expense" : "expenses"}, from any
                month
              </span>
            </p>
          )}
          <Link
            href="/incomes"
            className="mt-4 inline-block text-sm underline"
          >
            See pending reimbursements
          </Link>
        </section>
      </main>
    </>
  );
}
