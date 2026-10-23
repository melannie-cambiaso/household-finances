# Feature: project-foundation

Goal: runnable Next.js project with the Drizzle schema from `docs/data-model.md` and a generated initial migration.

Out of scope (later features): Neon connection, Better Auth + Google login, UI, derived-value queries.

Branch: `feat/project-foundation`

## Tasks

- [x] 1. Scaffold Next.js app with pnpm (TypeScript, App Router, Tailwind, ESLint) and create the feature branch
- [x] 2. Install Drizzle (drizzle-orm, drizzle-kit, postgres driver) and add config
- [x] 3. Define the schema per data-model.md (enums, tables, FKs, CHECK on budget_lines) — test-first where applicable
- [x] 4. Generate the initial migration and verify the SQL
- [ ] 5. Add .env.example, README with setup steps, and close

## Commits

(one work-unit commit per task, recorded here)

- Task 1: `2209492` Initial commit from Create Next App (scaffold, includes docs/); lint + build verified PASS. Tracking files committed right after on `feat/project-foundation`.
- Task 2: `1b6497f` chore: add Drizzle ORM, postgres driver and drizzle-kit config; tsc + lint PASS.
- Task 3: `c79bcd3` feat: define Drizzle schema per data model; tsc + lint PASS. No RED: no test runner and no meaningful structural test; SQL verified in task 4.
- Task 4: `888a869` feat: add initial database migration; applied to a throwaway local Postgres and spot-checked CHECK/UNIQUE constraints (month day, confirmed_at, same-account transfer, line target, duplicate line, pct range): PASS.
