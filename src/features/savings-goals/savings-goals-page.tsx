import { redirect } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import { todayIn } from "@/shared/dates";
import { listAccounts } from "@/features/accounts/service";
import { listGoalsWithProgress } from "@/features/savings-goals/service";
import { SavingsTabs } from "@/features/savings/savings-tabs";
import { getAllowedSession } from "@/features/auth/session";

import { GoalsSection } from "./goals-section";

const TIME_ZONE = "America/Santiago";

export default function SavingsGoalsPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <SavingsGoalsContent />
    </Suspense>
  );
}

async function SavingsGoalsContent() {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  const householdId = session.user.householdId;
  if (!householdId) {
    return <p className="p-8">Your account is not linked to a household.</p>;
  }

  // The current date is read after the session, which makes this render dynamic.
  const today = todayIn(TIME_ZONE);
  const [accounts, goals] = await Promise.all([
    listAccounts(db, householdId),
    listGoalsWithProgress(db, householdId),
  ]);
  const savingsAccounts = accounts.filter(
    (account) => account.kind === "savings",
  );

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-8 py-6">
        <div>
          <h1 className="text-3xl">Savings</h1>
          <p className="text-sm text-muted">
            What you are saving toward. A contribution is a transfer into a
            savings account, so it counts in your savings once.
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
        <SavingsTabs current="goals" />
        {/* Goals need no savings account to be created, but a contribution
            needs one that can receive it. */}
        <GoalsSection
          goals={goals}
          accounts={accounts.map(({ id, name }) => ({ id, name }))}
          savingsAccounts={savingsAccounts.map(({ id, name }) => ({
            id,
            name,
          }))}
          today={today}
        />
      </main>
    </>
  );
}
