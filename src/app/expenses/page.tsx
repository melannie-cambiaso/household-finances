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
  parseMonthParam,
  shiftMonth,
  todayIn,
} from "@/lib/expenses";
import { getAllowedSession } from "@/lib/session";

import { ExpenseForm } from "./expense-form";

const TIME_ZONE = "America/Santiago";

type SearchParams = Promise<{ month?: string | string[] }>;

export default function ExpensesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <Link href="/" className="underline">
          Home
        </Link>
      </div>
      <Suspense fallback={<p>Loading...</p>}>
        <ExpensesContent searchParams={searchParams} />
      </Suspense>
    </main>
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
    return <p role="alert">Your account is not linked to a household.</p>;
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
      {items.length === 0 || accounts.length === 0 ? (
        <p>
          There are no items or accounts yet. Run <code>pnpm db:seed</code> to
          add sample ones.
        </p>
      ) : (
        <ExpenseForm items={items} accounts={accounts} today={today} />
      )}

      <section className="grid gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{month.slice(0, 7)}</h2>
          <nav className="flex gap-4">
            <Link href={`/expenses?month=${shiftMonth(month, -1).slice(0, 7)}`}>
              Previous
            </Link>
            <Link href={`/expenses?month=${shiftMonth(month, 1).slice(0, 7)}`}>
              Next
            </Link>
          </nav>
        </div>

        {expenses.length === 0 ? (
          <p>No expenses for this month.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="py-2">Date</th>
                <th>Item</th>
                <th>Account</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Reimbursement</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-t">
                  <td className="py-2">{expense.spentOn}</td>
                  <td>
                    {expense.categoryName} / {expense.itemName}
                    {expense.description && (
                      <span className="block text-sm opacity-70">
                        {expense.description}
                      </span>
                    )}
                  </td>
                  <td>{expense.accountName}</td>
                  <td className="text-right">{formatClp(expense.amount)}</td>
                  <td className="text-right">
                    {expense.reimbursementPct === null
                      ? "-"
                      : `${expense.reimbursementPct}% = ${formatClp(
                          expectedReimbursement(
                            expense.amount,
                            expense.reimbursementPct,
                          ),
                        )}`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td colSpan={3} className="py-2">
                  Total
                </td>
                <td className="text-right">{formatClp(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </>
  );
}
