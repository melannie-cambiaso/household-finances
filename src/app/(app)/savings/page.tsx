import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import {
  formatClp,
  formatMonthLabel,
  parseMonthParam,
  shiftMonth,
  todayIn,
} from "@/lib/expenses";
import { getSavingsOverview } from "@/lib/savings-service";
import { getAllowedSession } from "@/lib/session";

import { Modal } from "../modal";
import { OpeningBalanceForm } from "./opening-balance-form";

const TIME_ZONE = "America/Santiago";

type SearchParams = Promise<{ month?: string | string[] }>;

const pillClass =
  "rounded-full border border-line px-4 py-1 text-sm text-muted transition-colors hover:bg-surface hover:text-text";

const secondaryButtonClass =
  "rounded-full border border-line px-4 py-1 text-sm text-muted transition-colors hover:bg-page hover:text-text";

/** "+ $50.000" for money that came in, "− $270.000" for money that left. */
function signed(amount: number): string {
  return `${amount < 0 ? "−" : "+"} ${formatClp(Math.abs(amount))}`;
}

export default function SavingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <SavingsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SavingsContent({
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

  const overview = await getSavingsOverview(db, householdId, month, today);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-8 py-6">
        <div>
          <h1 className="text-3xl">Savings</h1>
          <p className="text-sm text-muted">
            What you have saved and how it moved
          </p>
        </div>
        <nav aria-label="Month" className="flex items-center gap-3">
          <Link
            href={`/savings?month=${shiftMonth(month, -1).slice(0, 7)}`}
            className={pillClass}
          >
            ← Previous
          </Link>
          <span className="min-w-36 text-center text-xl">
            {formatMonthLabel(month)}
          </span>
          <Link
            href={`/savings?month=${shiftMonth(month, 1).slice(0, 7)}`}
            className={pillClass}
          >
            Next →
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
        {overview.accounts.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-6 text-muted">
            There is no savings account yet. Run{" "}
            <code className="rounded bg-page px-1">pnpm db:seed</code> to add
            sample ones.
          </p>
        ) : (
          <>
            <section
              role="status"
              className="rounded-card border border-line bg-surface p-6"
            >
              <h2 className="mb-1 text-xl">Saved today</h2>
              {overview.total === null ? (
                <p className="text-muted">
                  Set the opening balance of an account below to see your
                  balance.
                </p>
              ) : (
                <p>
                  <span className="font-numeric text-3xl font-bold text-income">
                    {formatClp(overview.total)}
                  </span>
                </p>
              )}
            </section>

            {overview.accounts.map((account) => (
              <section
                key={account.id}
                className="rounded-card border border-line bg-surface p-6"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl">{account.name}</h2>
                    {account.opening ? (
                      <p className="text-sm text-muted">
                        Starts from {formatClp(account.opening.amount)} on{" "}
                        {account.opening.on}
                      </p>
                    ) : (
                      <p className="text-sm text-muted">
                        No opening balance yet
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {account.balance !== null && (
                      <p className="font-numeric text-2xl font-bold">
                        {formatClp(account.balance)}
                      </p>
                    )}
                    <div className="mt-2 flex justify-end">
                      <Modal
                        triggerLabel={
                          account.opening
                            ? "Change opening balance"
                            : "Set opening balance"
                        }
                        triggerClassName={secondaryButtonClass}
                        title={`Opening balance of ${account.name}`}
                      >
                        <OpeningBalanceForm
                          accountId={account.id}
                          opening={account.opening}
                          today={today}
                        />
                      </Modal>
                    </div>
                  </div>
                </div>

                {account.statement && (
                  <div>
                    <h3 className="mb-3 text-lg">{formatMonthLabel(month)}</h3>
                    {account.statement.startBalance !== null && (
                      <p className="mb-3 text-sm text-muted">
                        Start of the month:{" "}
                        <span className="font-numeric">
                          {formatClp(account.statement.startBalance)}
                        </span>
                      </p>
                    )}

                    {account.statement.rows.length === 0 ? (
                      <p className="text-muted">No movements this month.</p>
                    ) : (
                      <ul className="flex flex-col gap-3">
                        {account.statement.rows.map((row, index) => (
                          <li
                            key={`${row.date}-${index}`}
                            className="flex items-start justify-between gap-4 rounded-2xl border border-line px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p>{row.label}</p>
                              <p className="text-sm text-muted">{row.date}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p
                                className={`font-numeric font-bold ${
                                  row.amount < 0 ? "text-expense" : "text-income"
                                }`}
                              >
                                {signed(row.amount)}
                              </p>
                              <p className="text-sm text-muted">
                                Balance{" "}
                                <span className="font-numeric">
                                  {formatClp(row.balance)}
                                </span>
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {account.statement.endBalance !== null && (
                      <p className="mt-3 text-sm text-muted">
                        End of the month:{" "}
                        <span className="font-numeric">
                          {formatClp(account.statement.endBalance)}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </section>
            ))}
          </>
        )}
      </main>
    </>
  );
}
