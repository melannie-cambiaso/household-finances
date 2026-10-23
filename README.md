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

## Expenses

`/expenses` records spending and lists the expenses of a month (`?month=YYYY-MM`, current month by default). Each expense is recorded against an item and an account, counts toward a budget month (the month it was paid unless you pick another), and freezes the item's reimbursement percentage at that moment. Amounts are whole CLP; dots as thousands separators are accepted. Dates use the America/Santiago time zone. It needs items and accounts: run `pnpm db:seed` first.
