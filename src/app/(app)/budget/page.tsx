import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import type { ProgressReport } from "@/lib/budget";
import { getBudgetMonth, getBudgetProgress } from "@/lib/budget-service";
import { listItems } from "@/lib/expense-service";
import {
  formatClp,
  formatMonthLabel,
  parseMonthParam,
  shiftMonth,
  todayIn,
} from "@/lib/expenses";
import { listIncomeSources } from "@/lib/income-service";
import { getAllowedSession } from "@/lib/session";

import { confirmBudgetAction, createBudgetAction } from "./actions";
import { BudgetEditor } from "./budget-editor";
import { ProgressSection } from "./progress-section";

const TIME_ZONE = "America/Santiago";

type SearchParams = Promise<{ month?: string | string[] }>;

const pillClass =
  "rounded-full border border-line px-4 py-1 text-sm text-muted transition-colors hover:bg-surface hover:text-text";

const primaryButtonClass =
  "rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90";

export default function BudgetPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <BudgetContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BudgetContent({ searchParams }: { searchParams: SearchParams }) {
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

  const [items, sources, budget, report] = await Promise.all([
    listItems(db, householdId),
    listIncomeSources(db, householdId),
    getBudgetMonth(db, householdId, month),
    getBudgetProgress(db, householdId, month),
  ]);

  // Planned amounts keyed by the editor's field names.
  const planned: Record<string, string> = {};
  for (const line of budget?.lines ?? []) {
    if (line.itemId) planned[`item:${line.itemId}`] = String(line.plannedAmount);
    if (line.incomeSourceId) {
      planned[`source:${line.incomeSourceId}`] = String(line.plannedAmount);
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-8 py-6">
        <div>
          <h1 className="text-3xl">Budget</h1>
          <p className="text-sm text-muted">What the household plans to spend</p>
        </div>
        <nav aria-label="Month" className="flex items-center gap-3">
          <Link
            href={`/budget?month=${shiftMonth(month, -1).slice(0, 7)}`}
            className={pillClass}
          >
            ← Previous
          </Link>
          <span className="min-w-36 text-center text-xl">
            {formatMonthLabel(month)}
          </span>
          <Link
            href={`/budget?month=${shiftMonth(month, 1).slice(0, 7)}`}
            className={pillClass}
          >
            Next →
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
        {items.length === 0 && sources.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-6 text-muted">
            There are no items or income sources yet. Run{" "}
            <code className="rounded bg-page px-1">pnpm db:seed</code> to add
            sample ones.
          </p>
        ) : !budget ? (
          <section className="rounded-card border border-line bg-surface p-6">
            <h2 className="mb-2 text-xl">
              No budget for {formatMonthLabel(month)}
            </h2>
            <p className="mb-4 text-muted">
              The new budget is a draft copied from the most recent earlier
              month, with the per-Friday income recalculated for this month. It
              starts empty if there is none.
            </p>
            <form action={createBudgetAction}>
              <input type="hidden" name="month" value={month} />
              <button type="submit" className={primaryButtonClass}>
                Create budget for {formatMonthLabel(month)}
              </button>
            </form>
          </section>
        ) : budget.status === "draft" ? (
          <>
            <p className="text-muted">
              <span className="rounded-full border border-line px-3 py-1 text-sm">
                Draft
              </span>{" "}
              You can change it freely until you confirm it.
            </p>
            <ProgressSection report={report} />
            <BudgetEditor
              month={month}
              items={items}
              sources={sources}
              planned={planned}
            />
            <section className="rounded-card border border-line bg-surface p-6">
              <h2 className="mb-2 text-xl">Confirm this budget</h2>
              <p className="mb-4 text-muted">
                Confirming locks the budget: its lines can no longer be added or
                changed, and it cannot be reopened. Save your changes first.
              </p>
              <form action={confirmBudgetAction} className="grid gap-4">
                <input type="hidden" name="month" value={month} />
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="understood" required />I
                  understand this cannot be undone
                </label>
                <button type="submit" className={`${primaryButtonClass} justify-self-start`}>
                  Confirm budget
                </button>
              </form>
            </section>
          </>
        ) : (
          <ConfirmedBudget
            report={report}
            planned={planned}
            items={items}
            sources={sources}
            confirmedAt={budget.confirmedAt}
          />
        )}
      </main>
    </>
  );
}

function ConfirmedBudget({
  report,
  planned,
  items,
  sources,
  confirmedAt,
}: {
  report: ProgressReport;
  planned: Record<string, string>;
  items: { id: string; name: string; categoryName: string }[];
  sources: { id: string; name: string }[];
  confirmedAt: Date | null;
}) {
  const plannedItems = items.filter((item) => `item:${item.id}` in planned);
  const plannedSources = sources.filter((s) => `source:${s.id}` in planned);

  return (
    <>
      <p className="text-muted">
        <span className="rounded-full border border-line px-3 py-1 text-sm">
          Confirmed
        </span>{" "}
        This budget is locked
        {confirmedAt && ` since ${confirmedAt.toISOString().slice(0, 10)}`}.
      </p>

      <ProgressSection report={report} />

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-4 text-xl">Planned spending</h2>
        {plannedItems.length === 0 ? (
          <p className="text-muted">Nothing planned.</p>
        ) : (
          <ul className="grid gap-2">
            {plannedItems.map((item) => (
              <li key={item.id} className="flex justify-between gap-4">
                <span>
                  {item.categoryName} / {item.name}
                </span>
                <span className="font-numeric font-bold text-expense">
                  {formatClp(Number(planned[`item:${item.id}`]))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-4 text-xl">Planned income</h2>
        {plannedSources.length === 0 ? (
          <p className="text-muted">Nothing planned.</p>
        ) : (
          <ul className="grid gap-2">
            {plannedSources.map((source) => (
              <li key={source.id} className="flex justify-between gap-4">
                <span>{source.name}</span>
                <span className="font-numeric font-bold text-income">
                  {formatClp(Number(planned[`source:${source.id}`]))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
