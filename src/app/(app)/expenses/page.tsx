import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import {
  listAccounts,
  listExpenses,
  listItems,
} from "@/lib/expense-service";
import {
  expectedReimbursement,
  formatClp,
  formatMonthLabel,
  parseMonthParam,
  shiftMonth,
  todayIn,
} from "@/lib/expenses";
import { getAllowedSession } from "@/lib/session";

import { Modal } from "../modal";
import { DeleteExpenseButton } from "./delete-expense-button";
import { ExpenseForm } from "./expense-form";

const TIME_ZONE = "America/Santiago";

type SearchParams = Promise<{ month?: string | string[] }>;

const pillClass =
  "rounded-full border border-line px-4 py-1 text-sm text-muted transition-colors hover:bg-surface hover:text-text";

const rowButtonClass =
  "rounded-full border border-line px-3 py-0.5 text-sm text-muted transition-colors hover:bg-page hover:text-text";

export default function ExpensesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <ExpensesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ExpensesContent({
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

  const [items, accounts, expenses] = await Promise.all([
    listItems(db, householdId),
    listAccounts(db, householdId),
    listExpenses(db, householdId, month),
  ]);

  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-8 py-6">
        <div>
          <h1 className="text-3xl">Expenses</h1>
          <p className="text-sm text-muted">What the household spent</p>
        </div>
        <nav aria-label="Month" className="flex items-center gap-3">
          <Link
            href={`/expenses?month=${shiftMonth(month, -1).slice(0, 7)}`}
            className={pillClass}
          >
            ← Previous
          </Link>
          <span className="min-w-36 text-center text-xl">
            {formatMonthLabel(month)}
          </span>
          <Link
            href={`/expenses?month=${shiftMonth(month, 1).slice(0, 7)}`}
            className={pillClass}
          >
            Next →
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
        {items.length === 0 || accounts.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-6 text-muted">
            There are no items or accounts yet. Run{" "}
            <code className="rounded bg-page px-1">pnpm db:seed</code> to add
            sample ones.
          </p>
        ) : (
          <div className="flex justify-end">
            <Modal
              triggerLabel="+ Add expense"
              triggerClassName="rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90"
              title="Add an expense"
            >
              <ExpenseForm
                items={items}
                accounts={accounts}
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
              <span className="font-numeric text-lg font-bold text-expense">
                {formatClp(total)}
              </span>
            </p>
          </div>

          {expenses.length === 0 ? (
            <p className="text-muted">No expenses for this month.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {expenses.map((expense) => (
                <li
                  key={expense.id}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-line px-4 py-3"
                >
                  <div className="min-w-0">
                    <p>
                      {expense.categoryName} / {expense.itemName}
                    </p>
                    <p className="text-sm text-muted">
                      {expense.spentOn} · {expense.accountName}
                      {expense.description && ` · ${expense.description}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-numeric font-bold text-expense">
                      {formatClp(expense.amount)}
                    </p>
                    {expense.reimbursementPct !== null && (
                      <p className="text-sm text-income">
                        {expense.reimbursementPct}% ={" "}
                        <span className="font-numeric font-bold">
                          {formatClp(
                            expectedReimbursement(
                              expense.amount,
                              expense.reimbursementPct,
                            ),
                          )}
                        </span>
                      </p>
                    )}
                    <div className="mt-2 flex justify-end gap-2">
                      <Modal
                        triggerLabel="Edit"
                        triggerClassName={rowButtonClass}
                        title="Edit expense"
                      >
                        <ExpenseForm
                          items={items}
                          accounts={accounts}
                          today={today}
                          expense={{
                            id: expense.id,
                            values: {
                              itemId: expense.itemId,
                              accountId: expense.accountId,
                              amount: String(expense.amount),
                              spentOn: expense.spentOn,
                              // The month input takes YYYY-MM.
                              budgetMonth: expense.budgetMonth.slice(0, 7),
                              description: expense.description ?? "",
                            },
                          }}
                        />
                      </Modal>
                      <DeleteExpenseButton
                        expenseId={expense.id}
                        className={rowButtonClass}
                      />
                    </div>
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
