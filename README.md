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

## Database

The schema lives in `src/db/schema.ts`. Migrations are generated into `drizzle/` and committed.

```bash
pnpm db:generate   # generate a migration after changing the schema
pnpm db:migrate    # apply pending migrations to DATABASE_URL
```

`drizzle-kit` reads `DATABASE_URL` from `.env` automatically. The app itself talks to the database through the client exported from `src/db/index.ts`.

## Development

```bash
pnpm dev     # start the dev server on http://localhost:3000
pnpm lint
pnpm build
```
