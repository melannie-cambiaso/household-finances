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

## Not verified

- Seed on an empty database (no household): the branch that creates the household was not exercised on Neon, which already had one.
