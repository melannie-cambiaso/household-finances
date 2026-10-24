# finanzas-hogar

Shared household finance app for two people. Built with Next.js, Drizzle ORM and Postgres (Neon), deployed on Vercel.

- Stack decisions: [`docs/stack.md`](docs/stack.md)
- Data model: [`docs/data-model.md`](docs/data-model.md)

## Setup

Requirements: Node.js and [pnpm](https://pnpm.io).

```bash
pnpm install
cp .env.example .env
```

Set `DATABASE_URL` in `.env` to a Postgres database. On Neon, use the pooled connection string (the host contains `-pooler`).

## Authentication

Login uses [Better Auth](https://www.better-auth.com) with Google. Sign-up is closed: only the emails in `ALLOWED_EMAILS` can sign in, and everyone else is rejected. An empty list allows nobody.

1. In the Google Cloud console, create an OAuth client (type: Web application) and add this authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (plus the production URL when you deploy).
2. Set these variables in `.env`:

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Signing secret. Generate one with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | App base URL, e.g. `http://localhost:3000`. |
| `GOOGLE_CLIENT_ID` | From the Google OAuth client. |
| `GOOGLE_CLIENT_SECRET` | From the Google OAuth client. |
| `ALLOWED_EMAILS` | Comma-separated emails allowed to sign in. |

The first allowed user to sign in creates the household; the second joins it. Better Auth uses the `users` table, and its extra tables are prefixed `auth_`.

## Database

The schema lives in `src/db/schema.ts`. Migrations are generated into `drizzle/` and committed.

```bash
pnpm db:generate   # generate a migration after changing the schema
pnpm db:migrate    # apply pending migrations to DATABASE_URL
pnpm db:seed       # insert sample accounts, income sources, categories and items
```

`db:seed` is idempotent: rows are matched by name and only the missing ones are inserted, so it is safe to run again. It uses the existing household (created on the first login) or creates one if there is none. The data lives in `src/db/seed-data.ts` and is only a sample; edit it to match your own categories and amounts before the first run, or change it in the app later.

`drizzle-kit` reads `DATABASE_URL` from `.env` automatically. The app itself talks to the database through the client exported from `src/db/index.ts`.

## Development

```bash
pnpm dev     # start the dev server on http://localhost:3000
pnpm lint
pnpm test    # unit tests (Node's built-in test runner)
pnpm build
```

Some tests need a real Postgres and are skipped unless `TEST_DATABASE_URL` is set. Point it at a throwaway database with the migrations applied (never your real one): the tests insert their own rows and delete them afterwards.

```bash
TEST_DATABASE_URL=postgres://user@localhost:5432/scratch pnpm test
```

## Styling

The look (warm dark theme, rounded handwritten-style font, rounded cards, pill buttons, left sidebar) was approximated by eye from a screenshot of a previous project. All colors, radii and fonts are design tokens in `src/app/globals.css` (`@theme`), and components use semantic names such as `bg-surface`, `text-muted`, `text-income` and `rounded-card`, so the whole look is tuned from that one file. The fonts are loaded in `src/app/layout.tsx`. The theme is dark only. Signed-in pages live in the `(app)` route group and share the sidebar in `src/app/(app)/sidebar.tsx`; add an entry to `NAV_ITEMS` when a page ships.

If the dev server keeps showing old styles after you change the tokens, restart `pnpm dev`.

## Expenses

`/expenses` records spending and lists the expenses of a month (`?month=YYYY-MM`, current month by default). Each expense is recorded against an item and an account, counts toward a budget month (the month it was paid unless you pick another), and freezes the item's reimbursement percentage at that moment. Amounts are whole CLP; dots as thousands separators are accepted. Dates use the America/Santiago time zone. It needs items and accounts: run `pnpm db:seed` first.

## Incomes and reimbursements

`/incomes` records money received and lists the incomes of a month (`?month=YYYY-MM`, current month by default). Each income comes from an income source, lands in an account (the source's usual account is preselected), and counts toward a budget month (the month it was received unless you pick another). Amounts and dates follow the same rules as expenses. It needs income sources and accounts: run `pnpm db:seed` first.

A reimbursement income can be linked to the expense it covers, but only when its source is a reimbursement source and the expense has a reimbursement percentage. A linked income never changes the expense. The "Pending reimbursements" section lists every reimbursable expense, from any month, with what is still owed: the expected amount (`amount × percentage`) minus the sum of the incomes linked to it. Over-reimbursed expenses show nothing owed.

### Integration tests

The service tests for expenses and incomes run only when `TEST_DATABASE_URL` points at a throwaway Postgres (for example a Neon branch) with the migrations applied; otherwise they are skipped. They create their own households and delete them afterwards.

## Monthly budget

`/budget` plans a month and compares it with what actually happened (`?month=YYYY-MM`, current month by default).

1. **Create.** A month with no budget shows a "Create budget" button. The new budget is a **draft** copied from the most recent earlier month; income from a per-Friday source is recalculated as `rate × Fridays in the new month`. It starts empty when there is no earlier budget.
2. **Edit.** A draft lists every item and income source with an amount field. Leave a field blank for no line; `0` is a planned amount of zero. Saving replaces the draft's lines all at once, and nothing is saved if any amount is invalid.
3. **Confirm.** Confirming locks the budget: it cannot be edited or reopened (the server refuses further saves, not just the UI). Expenses and incomes can still be recorded in any month.

Under the budget, "Spending vs. budget" shows planned vs. spent per item and per category, and "Income vs. budget" shows planned vs. received per source, including reimbursement income. Spending or income with no line appears tagged "not planned". Amounts count toward the month they were assigned to, not the date they were paid.

## Editing and deleting expenses and incomes

Every expense in `/expenses` and every income in `/incomes` has **Edit** and **Delete** buttons. Both work in any month and whatever the state of that month's budget: a confirmed budget locks its planned lines, not the records of what actually happened.

- **Edit** opens the same form used to add, pre-filled. An expense keeps the reimbursement percentage it was created with, so changing the amount or the date never rewrites history; the percentage is copied again only if you pick a different item. An expense that already has reimbursements linked to it cannot be moved to an item without a reimbursement percentage: unlink those incomes first. An income follows the same rules as when it was created (a reimbursement source can be linked only to a reimbursable expense).
- **Delete** asks for confirmation first. Deleting an expense keeps the reimbursement incomes that were linked to it, as ordinary incomes. Deleting an income that covered an expense makes that expense pending again.

Pending reimbursements and the budget progress are computed from the records, so they update by themselves after an edit or a delete. There is no undo and no history of changes.

## Dashboard

The home page summarizes one month (`?month=YYYY-MM`, current month by default): income and spending against the budget, the net of the month (received minus spent), the state of the budget with a link to create or open it, and the total of reimbursements still pending (from any month). It only reads data. The net is not an account balance: transfers between accounts cannot be recorded yet. For a month without a budget it shows the real amounts and says there is no budget to compare with.

## Transfers and the savings debt

`/transfers` records money moved between two accounts of the household and lists the transfers of a month (`?month=YYYY-MM`, current month by default, by the date of the transfer). Each one has a kind and can be edited or deleted; deleting asks for confirmation and there is no undo.

- **Funding** (for example Salary → Utilities) and **Other** only move money between accounts. A transfer is **never an expense**, so it never counts against the budget; the bills themselves are expenses paid from the Utilities account.
- **Repayment to savings** must go into a savings account, because that is what it pays back. A repayment anywhere else is refused.

The **savings debt** is never stored. It is computed on every visit as everything spent from savings accounts minus the repayments made into a savings account, over all time: a funding or an other transfer into savings does not pay it. It is shown at the top of `/transfers` and of the dashboard whenever it is above zero, and it disappears when it is zero or when more was repaid than spent.

Account balances are not shown yet.

## Deploying to Vercel

The app deploys from the GitHub repository: every push to `main` creates a production deployment.

1. **Create the project.** In Vercel, import the repository. Keep the default build settings (`next build`).
2. **Set the environment variables** (Project Settings → Environment Variables, for Production):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The Neon pooled connection string (the host contains `-pooler`). Using the same database as local development means both see the same data. |
| `BETTER_AUTH_SECRET` | A new secret for production: `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | The production URL, e.g. `https://your-app.vercel.app`. It is only known after the first deployment, so set it and redeploy. |
| `GOOGLE_CLIENT_ID` | From the Google OAuth client. |
| `GOOGLE_CLIENT_SECRET` | From the Google OAuth client. |
| `ALLOWED_EMAILS` | Comma-separated emails allowed to sign in. If it is empty nobody can sign in. |

3. **Deploy once** to get the production URL.
4. **Point the login at that URL.** Set `BETTER_AUTH_URL` to it, and in the Google Cloud console add `https://your-app.vercel.app/api/auth/callback/google` to the OAuth client's authorized redirect URIs. If the OAuth consent screen is in testing mode, both emails must be listed as test users.
5. **Redeploy** (a new deployment is needed for the changed variable to apply), then sign in.

The database migrations are not run by the deployment. Apply them with `pnpm db:migrate` against the database before deploying a change that adds a migration.

### The pnpm version

`package.json` pins `pnpm@12.15.0`, which Vercel does not support yet (see vercel/vercel issues 17434 and 17560). Without Corepack enabled, Vercel ignores that field and installs with its own pnpm from the lockfile version, which is expected to work, but this has not been confirmed with a real build. Do not set `ENABLE_EXPERIMENTAL_COREPACK`: it would force pnpm 12 and fail. If the install step fails, read the build log first; the options are to override the Install Command in the project settings or to pin an older pnpm in `package.json`.
