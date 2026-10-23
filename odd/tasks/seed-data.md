# Feature: seed-data

Goal: an idempotent `pnpm db:seed` that fills the household with sample accounts, income sources, categories and items so the UI has data to show.

Decision: sample data (not the user's real list); the user edits it later in the app.

Out of scope (later features): budget months and budget lines, expenses/incomes, UI to edit these entities, the user's real categories.

Branch: `feat/seed-data`

## Design decisions

- Seed content lives in a pure module (`src/db/seed-data.ts`) so its invariants can be unit tested; the script (`src/db/seed.ts`) only inserts.
- The script runs with Node's native TypeScript support, so it uses relative imports with `.ts` extensions and its own postgres client (it does not import `src/db/index.ts`).
- It uses the existing household (created on first login) and creates one only if none exists, same as the auth hook.
- Idempotent: rows are matched by name within the household and only missing ones are inserted. Re-running changes nothing.
- Money is integer CLP; amounts are plain samples.

## Tasks

- [x] 1. Seed data module with unit tests (test-first)
- [x] 2. Seed script, `db:seed` command, run it on Neon and verify idempotency
- [x] 3. README and close

## Commits

(one work-unit commit per task, recorded here)

- Task 1: `07cc30c` feat: add sample seed data with invariant tests. RED observed (module not found), GREEN 8/8; tsc + lint PASS; `pnpm test` 15/15.
- Task 2: `39be04c` feat: add idempotent db:seed script. Run on Neon: first run created 3 accounts, 4 income sources, 5 categories, 9 items (household already existed); second run created nothing and found all 21 rows. The script is `.mts` and silences MODULE_TYPELESS_PACKAGE_JSON for that command only, instead of setting `"type": "module"` for the whole project (it could affect Next).
- Task 3: `2b081e7` docs: document db:seed.

## Review follow-ups (approved review, advisory findings)

- R3-household-pick-unordered (SUGGESTION): the household was picked with `limit(1)` and no order. Fixed in `src/db/seed.mts` and in the auth hook (`src/lib/auth.ts`) with `orderBy(households.id)`, so both always pick the same row.
- R3-household-create-unverified (WARNING): verified the household-creation branch on a throwaway local Postgres with both migrations applied and no rows: run 1 created 1 household, 3 accounts, 4 income sources, 5 categories, 9 items; run 2 created nothing. The run pointed `DATABASE_URL` at the local database (`loadEnvFile` does not override variables already set), so Neon was not touched. tsc, lint and 15 tests PASS.

## Not verified

- The unordered-pick fix is not covered by a test: it only matters with more than one household, which the app never creates.
