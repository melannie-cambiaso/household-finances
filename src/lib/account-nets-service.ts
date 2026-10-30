import { and, asc, eq, gte, lt, ne, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../db/schema.ts";
import { shiftMonth } from "../shared/dates.ts";
import { accountNet, type AccountFlows } from "./account-nets.ts";

// Takes the database as a parameter so it can be tested against a throwaway
// Postgres. Relative imports keep it runnable by Node's native TypeScript support.
type Db = PostgresJsDatabase<typeof schema>;

export type AccountNet = AccountFlows & {
  id: string;
  name: string;
  kind: "salary" | "savings" | "utilities";
  net: number;
};

/**
 * The net of each non-savings account of the household over the calendar month starting on
 * `month` (first day of the month). Incomes and expenses count toward the budget
 * month they were recorded with, wherever their date falls; transfers have no budget
 * month, so they count by the day they were made. Derived on every call; nothing is
 * stored.
 */
export async function getAccountNets(
  db: Db,
  householdId: string,
  month: string,
): Promise<AccountNet[]> {
  const next = shiftMonth(month, 1);

  const accounts = await db
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      kind: schema.accounts.kind,
    })
    .from(schema.accounts)
    // Savings has its own page, with an opening balance and a statement.
    .where(
      and(
        eq(schema.accounts.householdId, householdId),
        ne(schema.accounts.kind, "savings"),
      ),
    )
    .orderBy(asc(schema.accounts.name), asc(schema.accounts.id));

  const sums = (rows: { accountId: string; total: number }[]) =>
    new Map(rows.map((r) => [r.accountId, r.total]));
  const sumOf = (amount: AnyPgColumn) => sql<number>`coalesce(sum(${amount}), 0)::int`;

  const incomes = sums(
    await db
      .select({ accountId: schema.incomes.accountId, total: sumOf(schema.incomes.amount) })
      .from(schema.incomes)
      .where(
        and(
          eq(schema.incomes.householdId, householdId),
          eq(schema.incomes.budgetMonth, month),
        ),
      )
      .groupBy(schema.incomes.accountId),
  );
  const expenses = sums(
    await db
      .select({ accountId: schema.expenses.accountId, total: sumOf(schema.expenses.amount) })
      .from(schema.expenses)
      .where(
        and(
          eq(schema.expenses.householdId, householdId),
          eq(schema.expenses.budgetMonth, month),
        ),
      )
      .groupBy(schema.expenses.accountId),
  );
  const inMonth = and(
    eq(schema.transfers.householdId, householdId),
    gte(schema.transfers.madeOn, month),
    lt(schema.transfers.madeOn, next),
  );
  const transfersIn = sums(
    await db
      .select({ accountId: schema.transfers.toAccountId, total: sumOf(schema.transfers.amount) })
      .from(schema.transfers)
      .where(inMonth)
      .groupBy(schema.transfers.toAccountId),
  );
  const transfersOut = sums(
    await db
      .select({ accountId: schema.transfers.fromAccountId, total: sumOf(schema.transfers.amount) })
      .from(schema.transfers)
      .where(inMonth)
      .groupBy(schema.transfers.fromAccountId),
  );

  return accounts.map((account) => {
    const flows: AccountFlows = {
      incomes: incomes.get(account.id) ?? 0,
      transfersIn: transfersIn.get(account.id) ?? 0,
      transfersOut: transfersOut.get(account.id) ?? 0,
      expenses: expenses.get(account.id) ?? 0,
    };
    return { ...account, ...flows, net: accountNet(flows) };
  });
}
