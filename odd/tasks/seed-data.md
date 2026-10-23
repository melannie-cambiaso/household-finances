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

- [ ] 1. Seed data module with unit tests (test-first)
- [ ] 2. Seed script, `db:seed` command, run it on Neon and verify idempotency
- [ ] 3. README and close

## Commits

(one work-unit commit per task, recorded here)
