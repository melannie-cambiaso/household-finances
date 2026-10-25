import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "../db/schema.ts";
import { shiftMonth } from "../shared/dates.ts";
import type { TransferInput } from "./transfers.ts";

// Takes the database as a parameter so it can be tested against a throwaway
// Postgres. Relative imports keep it runnable by Node's native TypeScript support.
type Db = PostgresJsDatabase<typeof schema>;

type TransferRejection = "account_not_found" | "repayment_must_go_to_savings";

/**
 * Rules shared by creating and editing: both accounts must belong to the
 * household, and a repayment must go into a savings account, because only that
 * reduces the savings debt. Returns the rejection, or null when it may be written.
 */
async function checkTransferAccounts(
  reader: Pick<Db, "select">,
  householdId: string,
  input: TransferInput,
): Promise<{ ok: false; error: TransferRejection } | null> {
  const found = await reader
    .select({ id: schema.accounts.id, kind: schema.accounts.kind })
    .from(schema.accounts)
    .where(
      and(
        inArray(schema.accounts.id, [input.fromAccountId, input.toAccountId]),
        eq(schema.accounts.householdId, householdId),
      ),
    );

  const to = found.find((account) => account.id === input.toAccountId);
  const from = found.find((account) => account.id === input.fromAccountId);
  if (!from || !to) return { ok: false, error: "account_not_found" };

  if (input.kind === "repayment" && to.kind !== "savings") {
    return { ok: false, error: "repayment_must_go_to_savings" };
  }
  return null;
}

export type CreateTransferResult =
  | { ok: true; id: string }
  | { ok: false; error: TransferRejection };

/** Inserts a transfer between two accounts of the household. */
export async function createTransfer(
  db: Db,
  householdId: string,
  input: TransferInput,
): Promise<CreateTransferResult> {
  const rejected = await checkTransferAccounts(db, householdId, input);
  if (rejected) return rejected;

  const [created] = await db
    .insert(schema.transfers)
    .values({
      householdId,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      madeOn: input.madeOn,
      kind: input.kind,
    })
    .returning({ id: schema.transfers.id });
  return { ok: true, id: created.id };
}

/** One transfer of the household, as the edit form needs it; null if it is not theirs. */
export async function getTransfer(db: Db, householdId: string, id: string) {
  const [row] = await db
    .select({
      id: schema.transfers.id,
      fromAccountId: schema.transfers.fromAccountId,
      toAccountId: schema.transfers.toAccountId,
      amount: schema.transfers.amount,
      madeOn: schema.transfers.madeOn,
      kind: schema.transfers.kind,
    })
    .from(schema.transfers)
    .where(
      and(
        eq(schema.transfers.id, id),
        eq(schema.transfers.householdId, householdId),
      ),
    );
  return row ?? null;
}

export type UpdateTransferResult =
  | { ok: true }
  | { ok: false; error: "transfer_not_found" | TransferRejection };

/** Updates a transfer of the household; the same rules as creating apply. */
export async function updateTransfer(
  db: Db,
  householdId: string,
  id: string,
  input: TransferInput,
): Promise<UpdateTransferResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: schema.transfers.id })
      .from(schema.transfers)
      .where(
        and(
          eq(schema.transfers.id, id),
          eq(schema.transfers.householdId, householdId),
        ),
      )
      .for("update");
    if (!current) {
      return { ok: false as const, error: "transfer_not_found" as const };
    }

    const rejected = await checkTransferAccounts(tx, householdId, input);
    if (rejected) return rejected;

    await tx
      .update(schema.transfers)
      .set({
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: input.amount,
        madeOn: input.madeOn,
        kind: input.kind,
      })
      .where(
        and(
          eq(schema.transfers.id, id),
          eq(schema.transfers.householdId, householdId),
        ),
      );
    return { ok: true as const };
  });
}

export type DeleteTransferResult =
  | { ok: true }
  | { ok: false; error: "transfer_not_found" };

/** Deletes a transfer of the household. Nothing else changes: the debt is derived. */
export async function deleteTransfer(
  db: Db,
  householdId: string,
  id: string,
): Promise<DeleteTransferResult> {
  const deleted = await db
    .delete(schema.transfers)
    .where(
      and(
        eq(schema.transfers.id, id),
        eq(schema.transfers.householdId, householdId),
      ),
    )
    .returning({ id: schema.transfers.id });
  return deleted.length > 0
    ? { ok: true }
    : { ok: false, error: "transfer_not_found" };
}

/**
 * Transfers made during the calendar month that starts on `month` (first day
 * of the month), newest first. Transfers have no budget month: only the date.
 */
export async function listTransfers(
  db: Db,
  householdId: string,
  month: string,
) {
  const from = alias(schema.accounts, "from_account");
  const to = alias(schema.accounts, "to_account");

  return db
    .select({
      id: schema.transfers.id,
      fromAccountId: schema.transfers.fromAccountId,
      toAccountId: schema.transfers.toAccountId,
      amount: schema.transfers.amount,
      madeOn: schema.transfers.madeOn,
      kind: schema.transfers.kind,
      fromName: from.name,
      toName: to.name,
    })
    .from(schema.transfers)
    .innerJoin(from, eq(schema.transfers.fromAccountId, from.id))
    .innerJoin(to, eq(schema.transfers.toAccountId, to.id))
    .where(
      and(
        eq(schema.transfers.householdId, householdId),
        gte(schema.transfers.madeOn, month),
        lt(schema.transfers.madeOn, shiftMonth(month, 1)),
      ),
    )
    .orderBy(desc(schema.transfers.madeOn), desc(schema.transfers.id));
}

/**
 * What the household owes its savings: everything spent from savings accounts,
 * plus the funding transfers that left a savings account for a non-savings one,
 * minus the repayments that ended in a savings account. Over all time, derived
 * on every call and never stored. It is negative when more was repaid than
 * spent; callers decide to show it only when it is above zero.
 */
export async function getSavingsDebt(
  db: Db,
  householdId: string,
): Promise<number> {
  const [spent] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.expenses.amount}), 0)::float8`,
    })
    .from(schema.expenses)
    .innerJoin(
      schema.accounts,
      eq(schema.expenses.accountId, schema.accounts.id),
    )
    .where(
      and(
        eq(schema.expenses.householdId, householdId),
        eq(schema.accounts.kind, "savings"),
      ),
    );

  const [repaid] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.transfers.amount}), 0)::float8`,
    })
    .from(schema.transfers)
    .innerJoin(
      schema.accounts,
      eq(schema.transfers.toAccountId, schema.accounts.id),
    )
    .where(
      and(
        eq(schema.transfers.householdId, householdId),
        eq(schema.transfers.kind, "repayment"),
        eq(schema.accounts.kind, "savings"),
      ),
    );

  // Money lent out of savings: a funding transfer from a savings account to any
  // other kind of account. Moving money between two savings accounts owes nothing.
  const fromAccount = alias(schema.accounts, "from_account");
  const toAccount = alias(schema.accounts, "to_account");
  const [lent] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.transfers.amount}), 0)::float8`,
    })
    .from(schema.transfers)
    .innerJoin(fromAccount, eq(schema.transfers.fromAccountId, fromAccount.id))
    .innerJoin(toAccount, eq(schema.transfers.toAccountId, toAccount.id))
    .where(
      and(
        eq(schema.transfers.householdId, householdId),
        eq(schema.transfers.kind, "funding"),
        eq(fromAccount.kind, "savings"),
        ne(toAccount.kind, "savings"),
      ),
    );

  return Number(spent.total) + Number(lent.total) - Number(repaid.total);
}
