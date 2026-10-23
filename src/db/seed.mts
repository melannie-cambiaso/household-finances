import { existsSync } from "node:fs";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.ts";
import { seedData } from "./seed-data.ts";

// Run with `pnpm db:seed`. Idempotent: rows are matched by name and only the
// missing ones are inserted, so running it twice changes nothing.

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const db = drizzle(sql, { schema });

const created: Record<string, number> = {};
const existing: Record<string, number> = {};

function count(bucket: Record<string, number>, table: string) {
  bucket[table] = (bucket[table] ?? 0) + 1;
}

await db.transaction(async (tx) => {
  // The household is created on the first login; create it only if missing.
  // Ordered by id so this picks the same row as the auth hook if there are ever several.
  let [household] = await tx
    .select({ id: schema.households.id })
    .from(schema.households)
    .orderBy(schema.households.id)
    .limit(1);
  if (household) {
    count(existing, "households");
  } else {
    [household] = await tx
      .insert(schema.households)
      .values({ name: "Household" })
      .returning({ id: schema.households.id });
    count(created, "households");
  }
  const householdId = household.id;

  const accountIds = new Map<string, string>();
  for (const account of seedData.accounts) {
    const [found] = await tx
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.householdId, householdId),
          eq(schema.accounts.name, account.name),
        ),
      );
    if (found) {
      accountIds.set(account.name, found.id);
      count(existing, "accounts");
      continue;
    }
    const [row] = await tx
      .insert(schema.accounts)
      .values({ householdId, name: account.name, kind: account.kind })
      .returning({ id: schema.accounts.id });
    accountIds.set(account.name, row.id);
    count(created, "accounts");
  }

  for (const source of seedData.incomeSources) {
    const [found] = await tx
      .select({ id: schema.incomeSources.id })
      .from(schema.incomeSources)
      .where(
        and(
          eq(schema.incomeSources.householdId, householdId),
          eq(schema.incomeSources.name, source.name),
        ),
      );
    if (found) {
      count(existing, "income_sources");
      continue;
    }
    const defaultAccountId = accountIds.get(source.defaultAccount);
    if (!defaultAccountId) {
      throw new Error(`Unknown account: ${source.defaultAccount}`);
    }
    await tx.insert(schema.incomeSources).values({
      householdId,
      name: source.name,
      kind: source.kind,
      defaultAmount: source.defaultAmount,
      defaultAccountId,
    });
    count(created, "income_sources");
  }

  for (const category of seedData.categories) {
    let [categoryRow] = await tx
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.householdId, householdId),
          eq(schema.categories.name, category.name),
        ),
      );
    if (categoryRow) {
      count(existing, "categories");
    } else {
      [categoryRow] = await tx
        .insert(schema.categories)
        .values({ householdId, name: category.name })
        .returning({ id: schema.categories.id });
      count(created, "categories");
    }

    for (const item of category.items) {
      const [found] = await tx
        .select({ id: schema.items.id })
        .from(schema.items)
        .where(
          and(
            eq(schema.items.categoryId, categoryRow.id),
            eq(schema.items.name, item.name),
          ),
        );
      if (found) {
        count(existing, "items");
        continue;
      }
      await tx.insert(schema.items).values({
        categoryId: categoryRow.id,
        name: item.name,
        reimbursementPct: item.reimbursementPct,
      });
      count(created, "items");
    }
  }
});

await sql.end();

console.log("created:", created);
console.log("already present:", existing);
