import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import { listAccounts } from "@/lib/expense-service";
import {
  formatClp,
  formatMonthLabel,
  parseMonthParam,
  shiftMonth,
  todayIn,
} from "@/lib/expenses";
import { getSavingsDebt, listTransfers } from "@/lib/transfer-service";
import { debtStanding, transferKindLabel } from "@/lib/transfers";
import { getAllowedSession } from "@/lib/session";

import { Modal } from "../modal";
import { DeleteTransferButton } from "./delete-transfer-button";
import { TransferForm } from "./transfer-form";

const TIME_ZONE = "America/Santiago";

type SearchParams = Promise<{ month?: string | string[] }>;

const pillClass =
  "rounded-full border border-line px-4 py-1 text-sm text-muted transition-colors hover:bg-surface hover:text-text";

const rowButtonClass =
  "rounded-full border border-line px-3 py-0.5 text-sm text-muted transition-colors hover:bg-page hover:text-text";

export default function TransfersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <TransfersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function TransfersContent({
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

  const [accounts, transfers, debt] = await Promise.all([
    listAccounts(db, householdId),
    listTransfers(db, householdId, month),
    getSavingsDebt(db, householdId),
  ]);
  const standing = debtStanding(debt);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-8 py-6">
        <div>
          <h1 className="text-3xl">Transfers</h1>
          <p className="text-sm text-muted">Money moved between accounts</p>
        </div>
        <nav aria-label="Month" className="flex items-center gap-3">
          <Link
            href={`/transfers?month=${shiftMonth(month, -1).slice(0, 7)}`}
            className={pillClass}
          >
            ← Previous
          </Link>
          <span className="min-w-36 text-center text-xl">
            {formatMonthLabel(month)}
          </span>
          <Link
            href={`/transfers?month=${shiftMonth(month, 1).slice(0, 7)}`}
            className={pillClass}
          >
            Next →
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
        {/* Always visible while it is not zero, whatever month is shown. */}
        {standing.kind === "credit" && (
          <section
            role="status"
            className="rounded-card border border-income bg-surface p-6"
          >
            <h2 className="mb-1 text-xl">Savings credit</h2>
            <p>
              <span className="font-numeric text-3xl font-bold text-income">
                {formatClp(standing.amount)}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted">
              More was repaid into savings accounts than was ever spent from them.
              Well done!
            </p>
          </section>
        )}
        {standing.kind === "debt" && (
          <section
            role="status"
            className="rounded-card border border-expense bg-surface p-6"
          >
            <h2 className="mb-1 text-xl">Savings debt</h2>
            <p>
              <span className="font-numeric text-3xl font-bold text-expense">
                {formatClp(standing.amount)}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted">
              Everything spent from savings accounts, minus the repayments made
              into them, over all time.
            </p>
          </section>
        )}

        {accounts.length < 2 ? (
          <p className="rounded-card border border-line bg-surface p-6 text-muted">
            A transfer needs at least two accounts. Run{" "}
            <code className="rounded bg-page px-1">pnpm db:seed</code> to add
            sample ones.
          </p>
        ) : (
          <div className="flex justify-end">
            <Modal
              triggerLabel="+ Add transfer"
              triggerClassName="rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90"
              title="Add a transfer"
            >
              <TransferForm
                accounts={accounts}
                today={today}
              />
            </Modal>
          </div>
        )}

        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="mb-4 text-xl">{formatMonthLabel(month)}</h2>

          {transfers.length === 0 ? (
            <p className="text-muted">No transfers for this month.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {transfers.map((transfer) => (
                <li
                  key={transfer.id}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-line px-4 py-3"
                >
                  <div className="min-w-0">
                    <p>
                      {transfer.fromName} → {transfer.toName}
                    </p>
                    <p className="text-sm text-muted">
                      {transfer.madeOn} · {transferKindLabel(transfer.kind)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-numeric font-bold">
                      {formatClp(transfer.amount)}
                    </p>
                    <div className="mt-2 flex justify-end gap-2">
                      <Modal
                        triggerLabel="Edit"
                        triggerClassName={rowButtonClass}
                        title="Edit transfer"
                      >
                        <TransferForm
                          accounts={accounts}
                          today={today}
                          transfer={{
                            id: transfer.id,
                            values: {
                              fromAccountId: transfer.fromAccountId,
                              toAccountId: transfer.toAccountId,
                              amount: String(transfer.amount),
                              madeOn: transfer.madeOn,
                              kind: transfer.kind,
                            },
                          }}
                        />
                      </Modal>
                      <DeleteTransferButton
                        transferId={transfer.id}
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
