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
- [x] 4. Route handler, auth client, `proxy.ts` route protection and a minimal login page
- [x] 5. `.env.example`, README setup (Google OAuth, secret, allowlist) and close

## Commits

(one work-unit commit per task, recorded here)

- Task 1: `df950b6` chore: add better-auth and ODD tracking. better-auth 1.7.12; API verified against package types (advanced.database.generateId "uuid", databaseHooks.user.create.before, drizzleAdapter schema map, nextCookies/toNextJsHandler).
- Task 2: `c1c37f2` feat: extend schema for Better Auth tables. Better Auth tables prefixed `auth_` because `accounts` is the household's money accounts. Migration 0001 applied to Neon.
- Task 3: `d7de0d6` feat: add Better Auth config with Google and email allowlist. RED observed (module not found), GREEN 7/7 with `node --test`; tsc + lint PASS. Adapter/DB mapping is verified in task 4 (needs the dev server).
- Task 4: `4fef070` feat: add auth route, login page and proxy route protection. Dev server: `/` 307 -> `/login`, `/login` 200, `/api/auth/get-session` null/200. Temporary route (deleted) proved against Neon: users + auth_sessions queries work through the adapter mapping and the hook rejects a non-allowlisted email with FORBIDDEN. First build failed (`headers()` outside Suspense with Cache Components); fixed with a static shell + Suspense; build PASS (with a throwaway BETTER_AUTH_SECRET passed inline).
- Task 5: `de4fc3e` docs: document authentication setup. `.env.example` is blocked for the agent: the user adds the new variables (BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_EMAILS).

## Post-close fix

- First real Google login failed with `MISSING_FIELD: householdId is required`: Better Auth validates `required` additional fields against the provider profile before `databaseHooks.user.create.before` runs (`better-auth/dist/db/schema.mjs`). Fix: `householdId` is `required: false` in the Better Auth config; the DB column stays NOT NULL and the hook always sets it. My earlier temporary check missed this because `internalAdapter.createUser` skips that validation.

## Not verified

- Real Google login end to end and the allowed-email path (create user + household): needs the user's Google OAuth credentials and `ALLOWED_EMAILS` in `.env`.
