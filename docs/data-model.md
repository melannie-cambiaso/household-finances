# Data Model (draft v0.2)

Shared household finance app. Target stack: Next.js + hosted Postgres, deployed on Vercel.

## Decisions so far

| Topic | Decision |
| --- | --- |
| Ownership | One **household** with 2 users. All data belongs to the household. |
| Month ownership | Every expense belongs to a **budget month**, independent of the date it was paid. |
| Reimbursements | Modeled as **income** in the month they arrive. They never reduce the original expense. The app **suggests** the expected amount (`expense * reimbursement_pct`) and tracks what is still pending. |
| Savings debt | A **derived balance**, never stored: every expense paid from a savings account minus repayments. No flag, no exceptions (emergencies are repaid too). |
| Friday income | Fixed amount per Friday, paid into the Salary account. Planned amount is computed from the calendar: `rate_per_friday * fridays_in_month`. |
| Frozen percentage | `reimbursement_pct` is copied from the item into the expense when it is created, so later changes never rewrite history. |
| Budget lifecycle | A new month's budget is **copied from the previous month** as a `draft`, editable freely. Once the user **confirms** it, it is locked (no adding or editing lines). If a month starts with no budget, the app auto-copies one as a `draft`. Expenses and incomes can be recorded in any state. |
| Money | Stored as integer amounts (no floats). Assumes a currency without decimals (CLP). |

## Entities

```
households 1─* users
households 1─* accounts
households 1─* categories 1─* items
households 1─* budget_months 1─* budget_lines
households 1─* income_sources
households 1─* incomes
households 1─* expenses
households 1─* transfers
```

### households
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| name | text | |

### users
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| household_id | uuid FK | |
| name | text | |
| email | text unique | Login identity |

### accounts
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| household_id | uuid FK | |
| name | text | e.g. "Salary", "Savings", "Utilities" |
| kind | enum | `salary` / `savings` / `utilities` |
| opening_balance | integer, nullable | Savings accounts only: how much was saved at the start of `opening_balance_on` |
| opening_balance_on | date, nullable | Day `opening_balance` was counted at the start of; movements from that day on count |

### categories and items
Categories group items (Subscriptions → Claude). Spending is always recorded against an **item**; a category total is the sum of its items.

| Table | Columns |
| --- | --- |
| categories | id, household_id, name |
| items | id, category_id, name, reimbursement_pct (integer 0-100, null = not reimbursable) |

Simple categories (Groceries) get a single item so the model stays uniform.

### budget_months
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| household_id | uuid FK | |
| month | date | First day of the month. Unique per household. |
| copied_from_id | uuid FK null | Previous budget month this one was copied from |
| status | enum | `draft` / `confirmed` |
| confirmed_at | timestamptz null | Set when confirmed; lines become read-only |

Locking is an explicit user action, not a date rule. Confirmation is one-way: no reopening. A draft left unconfirmed stays editable even after its month has started.

### budget_lines
One planned amount per item (expense) or per income source (income), per month.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| budget_month_id | uuid FK | |
| item_id | uuid FK null | Set for expense lines |
| income_source_id | uuid FK null | Set for income lines |
| planned_amount | integer | |

Constraint: exactly one of `item_id` / `income_source_id` is set. Unique per (month, target).

### income_sources
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| household_id | uuid FK | |
| name | text | e.g. "Salary (me)", "Salary (spouse)", "Friday income", "Health reimbursement" |
| kind | enum | `fixed` / `per_friday` / `reimbursement` |
| default_amount | integer null | Fixed amount, or rate per Friday. Null for reimbursements. |
| default_account_id | uuid FK | Where the money usually lands |

For `per_friday`, the planned amount of a month is `default_amount * fridays_in_month`, copied into the budget line when the month is created.

### incomes (actual money received)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| household_id | uuid FK | |
| income_source_id | uuid FK | |
| account_id | uuid FK | |
| budget_month | date | Month it counts toward |
| received_on | date | |
| amount | integer | |
| related_expense_id | uuid FK null | Links a reimbursement to the expense it covers. Does not affect budget totals, but drives the pending-reimbursement view. |
| created_by | uuid FK users | |

### expenses (actual spending)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| household_id | uuid FK | |
| item_id | uuid FK | |
| account_id | uuid FK | Where the money came out of |
| budget_month | date | Month it counts toward |
| spent_on | date | When it was actually paid |
| amount | integer | |
| description | text null | |
| reimbursement_pct | integer null | Frozen copy of `items.reimbursement_pct` at creation time |
| created_by | uuid FK users | |

### transfers
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| household_id | uuid FK | |
| from_account_id | uuid FK | |
| to_account_id | uuid FK | |
| amount | integer | |
| made_on | date | |
| kind | enum | `repayment` / `funding` / `other` |

A `funding` transfer (Salary → Utilities) moves money between accounts; it is **not an expense**, so it never counts against the budget. The actual utility bills are recorded as expenses paid from the Utilities account.

Only `repayment` transfers into a `savings` account reduce the debt. The debt is always visible in the UI whenever it is above zero.

## Derived values (computed, never stored)

```
Month progress, per item:    planned (budget_lines) vs sum(expenses.amount) for that budget_month
Month progress, per category: sum over its items
Income progress:             planned income lines vs sum(incomes.amount) for that budget_month
Account balance:             sum(incomes) - sum(expenses) +/- transfers, per account
Account net (month):         incomes in + transfers in - transfers out - expenses, per account; incomes and
                             expenses by budget_month, transfers by made_on (no opening balance needed);
                             Salary and Utilities only, Savings has its own page
Savings balance:             opening_balance + incomes in + transfers in - transfers out - expenses,
                             all dated from opening_balance_on on and up to today, per savings account

Expected reimbursement:      expense.amount * expense.reimbursement_pct / 100
Pending reimbursement:       expected - sum(incomes.amount WHERE related_expense_id = expense.id)

Savings debt = sum(expenses.amount WHERE account.kind = 'savings')
             - sum(transfers.amount WHERE kind = 'repayment' AND to = a savings account)
```

## Open questions

None. Next step: review this document, then scaffold the Next.js project.
