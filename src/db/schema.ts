import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const accountKind = pgEnum("account_kind", [
  "salary",
  "savings",
  "utilities",
]);
export const budgetStatus = pgEnum("budget_status", ["draft", "confirmed"]);
export const incomeSourceKind = pgEnum("income_source_kind", [
  "fixed",
  "per_friday",
  "reimbursement",
]);
export const transferKind = pgEnum("transfer_kind", [
  "repayment",
  "funding",
  "other",
]);

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
});

// Also the Better Auth user model: the extra columns below are required by it.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Better Auth tables. Prefixed with auth_ because `accounts` is already the
// household's money accounts.
export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authAccounts = pgTable("auth_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authVerifications = pgTable("auth_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id),
  name: text("name").notNull(),
  kind: accountKind("kind").notNull(),
  // Savings only: how much was saved on `openingBalanceOn`. Both stay null until
  // the user sets them; the balance is derived from them plus later movements.
  openingBalance: integer("opening_balance"),
  openingBalanceOn: date("opening_balance_on", { mode: "string" }),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id),
  name: text("name").notNull(),
});

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    name: text("name").notNull(),
    // null = not reimbursable
    reimbursementPct: integer("reimbursement_pct"),
  },
  (t) => [
    check(
      "items_reimbursement_pct_range",
      sql`${t.reimbursementPct} IS NULL OR ${t.reimbursementPct} BETWEEN 0 AND 100`,
    ),
  ],
);

export const incomeSources = pgTable(
  "income_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    kind: incomeSourceKind("kind").notNull(),
    // Fixed amount, or rate per Friday. Null for reimbursements.
    defaultAmount: integer("default_amount"),
    defaultAccountId: uuid("default_account_id")
      .notNull()
      .references(() => accounts.id),
  },
  (t) => [
    check(
      "income_sources_default_amount_non_negative",
      sql`${t.defaultAmount} IS NULL OR ${t.defaultAmount} >= 0`,
    ),
  ],
);

export const budgetMonths = pgTable(
  "budget_months",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    // First day of the month.
    month: date("month", { mode: "string" }).notNull(),
    copiedFromId: uuid("copied_from_id").references(
      (): AnyPgColumn => budgetMonths.id,
    ),
    status: budgetStatus("status").notNull().default("draft"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [
    unique("budget_months_household_month_unique").on(t.householdId, t.month),
    check(
      "budget_months_month_is_first_day",
      sql`EXTRACT(DAY FROM ${t.month}) = 1`,
    ),
    check(
      "budget_months_confirmed_at_matches_status",
      sql`(${t.status} = 'confirmed') = (${t.confirmedAt} IS NOT NULL)`,
    ),
  ],
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    budgetMonthId: uuid("budget_month_id")
      .notNull()
      .references(() => budgetMonths.id),
    // Set for expense lines.
    itemId: uuid("item_id").references(() => items.id),
    // Set for income lines.
    incomeSourceId: uuid("income_source_id").references(
      () => incomeSources.id,
    ),
    plannedAmount: integer("planned_amount").notNull(),
  },
  (t) => [
    check(
      "budget_lines_exactly_one_target",
      sql`(${t.itemId} IS NULL) <> (${t.incomeSourceId} IS NULL)`,
    ),
    check("budget_lines_planned_amount_non_negative", sql`${t.plannedAmount} >= 0`),
    // Postgres treats NULLs as distinct, so each unique only constrains its own kind of line.
    unique("budget_lines_month_item_unique").on(t.budgetMonthId, t.itemId),
    unique("budget_lines_month_income_source_unique").on(
      t.budgetMonthId,
      t.incomeSourceId,
    ),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    // Month it counts toward (first day of the month).
    budgetMonth: date("budget_month", { mode: "string" }).notNull(),
    // When it was actually paid.
    spentOn: date("spent_on", { mode: "string" }).notNull(),
    amount: integer("amount").notNull(),
    description: text("description"),
    // Frozen copy of items.reimbursement_pct at creation time.
    reimbursementPct: integer("reimbursement_pct"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    // When it was recorded: orders the expenses of the same day.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("expenses_amount_positive", sql`${t.amount} > 0`),
    check(
      "expenses_reimbursement_pct_range",
      sql`${t.reimbursementPct} IS NULL OR ${t.reimbursementPct} BETWEEN 0 AND 100`,
    ),
  ],
);

export const incomes = pgTable(
  "incomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    incomeSourceId: uuid("income_source_id")
      .notNull()
      .references(() => incomeSources.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    // Month it counts toward (first day of the month).
    budgetMonth: date("budget_month", { mode: "string" }).notNull(),
    receivedOn: date("received_on", { mode: "string" }).notNull(),
    amount: integer("amount").notNull(),
    // Links a reimbursement to the expense it covers.
    relatedExpenseId: uuid("related_expense_id").references(() => expenses.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
  },
  (t) => [check("incomes_amount_positive", sql`${t.amount} > 0`)],
);

export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    fromAccountId: uuid("from_account_id")
      .notNull()
      .references(() => accounts.id),
    toAccountId: uuid("to_account_id")
      .notNull()
      .references(() => accounts.id),
    amount: integer("amount").notNull(),
    madeOn: date("made_on", { mode: "string" }).notNull(),
    kind: transferKind("kind").notNull(),
  },
  (t) => [
    check("transfers_amount_positive", sql`${t.amount} > 0`),
    check(
      "transfers_distinct_accounts",
      sql`${t.fromAccountId} <> ${t.toAccountId}`,
    ),
  ],
);
