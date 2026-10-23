# Feature: better-auth

Goal: Google login with Better Auth, restricted to an allowlist of two household emails. Better Auth uses our `users` table (single-table design) extended with `household_id`.

Out of scope (later features): app UI beyond a minimal login page, role/permission rules, seed data for accounts/categories.

Branch: `feat/better-auth`

## Design decisions

- Single table: Better Auth's user model is mapped to `users`; we add `household_id` and the columns Better Auth requires. Existing FKs (`expenses.created_by`, `incomes.created_by`) stay valid.
- Allowlist: emails come from an env var; a user-create hook rejects any other email and assigns the household.
- Next.js 16 renamed `middleware` to `proxy`; route protection uses `proxy.ts`.
- Secrets (`BETTER_AUTH_SECRET`, Google client id/secret, allowlist) live in `.env`, owned by the user (the agent cannot read or write `.env*`).

## Tasks

- [x] 1. Install better-auth and verify its API against the installed package types
- [x] 2. Extend the schema (`users` columns, session/account/verification), generate the migration and apply it to Neon
- [x] 3. Auth config (`src/lib/auth.ts`): Drizzle adapter, `users` mapping, uuid ids, Google provider, allowlist + household hook
- [ ] 4. Route handler, auth client, `proxy.ts` route protection and a minimal login page
- [ ] 5. `.env.example`, README setup (Google OAuth, secret, allowlist) and close

## Commits

(one work-unit commit per task, recorded here)

- Task 1: `df950b6` chore: add better-auth and ODD tracking. better-auth 1.7.12; API verified against package types (advanced.database.generateId "uuid", databaseHooks.user.create.before, drizzleAdapter schema map, nextCookies/toNextJsHandler).
- Task 2: `c1c37f2` feat: extend schema for Better Auth tables. Better Auth tables prefixed `auth_` because `accounts` is the household's money accounts. Migration 0001 applied to Neon.
- Task 3: `d7de0d6` feat: add Better Auth config with Google and email allowlist. RED observed (module not found), GREEN 7/7 with `node --test`; tsc + lint PASS. Adapter/DB mapping is verified in task 4 (needs the dev server).
