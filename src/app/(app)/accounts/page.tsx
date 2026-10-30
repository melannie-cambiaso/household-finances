import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import { formatClp } from "@/shared/money";
import { formatMonthLabel, parseMonthParam, shiftMonth, todayIn } from "@/shared/dates";
import { getAccountNets } from "@/lib/account-nets-service";
import { getAllowedSession } from "@/lib/session";

const TIME_ZONE = "America/Santiago";

type SearchParams = Promise<{ month?: string | string[] }>;

const pillClass =
  "rounded-full border border-line px-4 py-1 text-sm text-muted transition-colors hover:bg-surface hover:text-text";

export default function AccountsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <AccountsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AccountsContent({
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

  const nets = await getAccountNets(db, householdId, month);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-8 py-6">
        <div>
          <h1 className="text-3xl">Accounts</h1>
          <p className="text-sm text-muted">
            What each account gained or lost in the month
          </p>
        </div>
        <nav aria-label="Month" className="flex items-center gap-3">
          <Link
            href={`/accounts?month=${shiftMonth(month, -1).slice(0, 7)}`}
            className={pillClass}
          >
            ← Previous
          </Link>
          <span className="min-w-36 text-center text-xl">
            {formatMonthLabel(month)}
          </span>
          <Link
            href={`/accounts?month=${shiftMonth(month, 1).slice(0, 7)}`}
            className={pillClass}
          >
            Next →
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
        {nets.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-6 text-muted">
            There are no accounts yet. Run{" "}
            <code className="rounded bg-page px-1">pnpm db:seed</code> to add
            sample ones.
          </p>
        ) : (
          nets.map((account) => (
            <section
              key={account.id}
              className="rounded-card border border-line bg-surface p-6"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 className="text-xl">{account.name}</h2>
                <p
                  className={`font-numeric text-2xl font-bold ${
                    account.net < 0 ? "text-expense" : "text-income"
                  }`}
                >
                  {account.net < 0 ? "−" : ""}
                  {formatClp(Math.abs(account.net))}
                </p>
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Incomes</dt>
                <dd className="font-numeric text-right">{formatClp(account.incomes)}</dd>
                <dt className="text-muted">Transfers in</dt>
                <dd className="font-numeric text-right">{formatClp(account.transfersIn)}</dd>
                <dt className="text-muted">Transfers out</dt>
                <dd className="font-numeric text-right">− {formatClp(account.transfersOut)}</dd>
                <dt className="text-muted">Expenses</dt>
                <dd className="font-numeric text-right">− {formatClp(account.expenses)}</dd>
              </dl>
            </section>
          ))
        )}
      </main>
    </>
  );
}
