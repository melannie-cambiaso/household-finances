# Feature: neon-connection

Goal: the app connects to Neon Postgres through Drizzle and the initial migration is applied and verified on the real database.

Out of scope (later features): Better Auth + Google login, UI, derived-value queries, seed data.

Branch: `feat/neon-connection`

## Tasks

- [x] 1. Add the Drizzle client (`src/db/index.ts`) reading `DATABASE_URL`
- [x] 2. Make `drizzle.config.ts` load `.env` for `db:migrate` and apply the initial migration to Neon
- [x] 3. Verify the tables, enums and constraints on Neon (read-only queries)
- [x] 4. Update README and close

## Commits

(one work-unit commit per task, recorded here)

- Task 1: `0f7c09e` feat: add Drizzle client for Postgres; tsc + lint PASS.
- Task 2: `ffc5478` feat: load .env in drizzle config; `pnpm db:migrate` against Neon: applied successfully.
- Task 3: no code change (read-only verification, evidence recorded here). On Neon: 11 tables, 4 enums, 11 CHECK, 23 FK, 1 migration registered; all match the generated SQL.
- Task 4: README update, `f729175` docs: document Neon connection and migrations.
