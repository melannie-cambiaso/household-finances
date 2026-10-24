import { and, asc, eq, gte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../db/schema.ts";
import {
  currentBalance,
  monthStatement,
  type MonthStatement,
  type Movement,
  type OpeningBalance,
} from "./savings.ts";

// Takes the database as a parameter so it can be tested against a throwaway
// Postgres. Relative imports keep it runnable by Node's native TypeScript support.
type Db = PostgresJsDatabase<typeof schema>;

export type SetOpeningBalanceResult =
  | { ok: true }
  | { ok: false; error: "account_not_found" | "not_savings_account" };

/** Sets, or replaces, the opening balance of a savings account of the household. */
export async function setOpeningBalance(
  db: Db,
  householdId: string,
  accountId: string,
  opening: OpeningBalance,
): Promise<SetOpeningBalanceResult> {
  const [account] = await db
    .select({ kind: schema.accounts.kind })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.id, accountId),
        eq(schema.accounts.householdId, householdId),
      ),
    );
  if (!account) return { ok: false, error: "account_not_found" };
  if (account.kind !== "savings") return { ok: false, error: "not_savings_account" };

  await db
    .update(schema.accounts)
    .set({ openingBalance: opening.amount, openingBalanceOn: opening.on })
    .where(
      and(
        eq(schema.accounts.id, accountId),
        eq(schema.accounts.householdId, householdId),
      ),
    );
  return { ok: true };
}

/**
 * Every movement of one account dated on or after `since`: incomes into it, transfers
 * into and out of it, and expenses paid from it. Signed from the account's side.
 */
async function loadMovements(
  db: Db,
  householdId: string,
  accountId: string,
  since: string,
): Promise<Movement[]> {
  const incomes = await db
    .select({
      date: schema.incomes.receivedOn,
      amount: schema.incomes.amount,
      source: schema.incomeSources.name,
    })
    .from(schema.incomes)
    .innerJoin(
      schema.incomeSources,
      eq(schema.incomes.incomeSourceId, schema.incomeSources.id),
    )
    .where(
      and(
        eq(schema.incomes.householdId, householdId),
        eq(schema.incomes.accountId, accountId),
        gte(schema.incomes.receivedOn, since),
      ),
    )
    .orderBy(asc(schema.incomes.receivedOn), asc(schema.incomes.id));

  const from = alias(schema.accounts, "from_account");
  const to = alias(schema.accounts, "to_account");
  const transfers = await db
    .select({
      date: schema.transfers.madeOn,
      amount: schema.transfers.amount,
      toAccountId: schema.transfers.toAccountId,
      fromName: from.name,
      toName: to.name,
    })
    .from(schema.transfers)
    .innerJoin(from, eq(schema.transfers.fromAccountId, from.id))
    .innerJoin(to, eq(schema.transfers.toAccountId, to.id))
    .where(
      and(
        eq(schema.transfers.householdId, householdId),
        gte(schema.transfers.madeOn, since),
        // Either side of the transfer is this account.
        or(
          eq(schema.transfers.fromAccountId, accountId),
          eq(schema.transfers.toAccountId, accountId),
        ),
      ),
    )
    .orderBy(asc(schema.transfers.madeOn), asc(schema.transfers.id));

  const expenses = await db
    .select({
      date: schema.expenses.spentOn,
      amount: schema.expenses.amount,
      description: schema.expenses.description,
      item: schema.items.name,
      category: schema.categories.name,
    })
    .from(schema.expenses)
    .innerJoin(schema.items, eq(schema.expenses.itemId, schema.items.id))
    .innerJoin(schema.categories, eq(schema.items.categoryId, schema.categories.id))
    .where(
      and(
        eq(schema.expenses.householdId, householdId),
        eq(schema.expenses.accountId, accountId),
        gte(schema.expenses.spentOn, since),
      ),
    )
    .orderBy(asc(schema.expenses.spentOn), asc(schema.expenses.id));

  const movements: Movement[] = [
    ...incomes.map((r): Movement => ({
      date: r.date,
      amount: r.amount,
      label: r.source,
      kind: "income",
    })),
    ...transfers.map((r): Movement =>
      r.toAccountId === accountId
        ? { date: r.date, amount: r.amount, label: `From ${r.fromName}`, kind: "transfer_in" }
        : { date: r.date, amount: -r.amount, label: `To ${r.toName}`, kind: "transfer_out" },
    ),
    ...expenses.map((r): Movement => ({
      date: r.date,
      amount: -r.amount,
      label: `${r.item} (${r.category})${r.description ? ` · ${r.description}` : ""}`,
      kind: "expense",
    })),
  ];
  // Stable: movements of the same day keep the order above.
  return movements.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export type SavingsAccountOverview = {
  id: string;
  name: string;
  opening: OpeningBalance | null;
  /** Balance today; null until an opening balance is set. */
  balance: number | null;
  /** The chosen month; null until an opening balance is set. */
  statement: MonthStatement | null;
};

export type SavingsOverview = {
  accounts: SavingsAccountOverview[];
  /** Sum of the balances that are known; null when none is. */
  total: number | null;
};

/**
 * The household's savings accounts with their balance today and their statement
 * for the calendar month starting on `month` (first day of the month). Derived
 * on every call; only the opening balance is stored.
 */
export async function getSavingsOverview(
  db: Db,
  householdId: string,
  month: string,
  today: string,
): Promise<SavingsOverview> {
  const accounts = await db
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      openingBalance: schema.accounts.openingBalance,
      openingBalanceOn: schema.accounts.openingBalanceOn,
    })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.householdId, householdId),
        eq(schema.accounts.kind, "savings"),
      ),
    )
    .orderBy(asc(schema.accounts.name), asc(schema.accounts.id));

  const overviews: SavingsAccountOverview[] = [];
  for (const account of accounts) {
    if (account.openingBalance === null || account.openingBalanceOn === null) {
      overviews.push({
        id: account.id,
        name: account.name,
        opening: null,
        balance: null,
        statement: null,
      });
      continue;
    }
    const opening = { amount: account.openingBalance, on: account.openingBalanceOn };
    const movements = await loadMovements(db, householdId, account.id, opening.on);
    overviews.push({
      id: account.id,
      name: account.name,
      opening,
      balance: currentBalance(opening, movements, today),
      statement: monthStatement(opening, movements, month),
    });
  }

  const known = overviews.flatMap((a) => (a.balance === null ? [] : [a.balance]));
  return {
    accounts: overviews,
    total: known.length === 0 ? null : known.reduce((sum, b) => sum + b, 0),
  };
}
