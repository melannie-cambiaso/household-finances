# Architecture

The code is organized by feature: everything that belongs to one part of the app lives in one folder.

```
src/
  app/        Routes only. Thin shells that point to a feature page, plus the layout and sidebar.
  features/   One folder per feature (see below).
  shared/     Helpers every feature uses: ids, money, dates and months, and the generic Modal.
  db/         Drizzle schema, client and seed.
  proxy.ts    Request proxy (middleware).
```

## A feature folder

Every feature uses the same file names, so you always know where to look:

| File | What it holds |
| --- | --- |
| `rules.ts` | Pure validation and calculation. No database, no framework. |
| `service.ts` | Database access. Takes the database as a parameter so it can be tested. |
| `actions.ts` | Server Actions: read the form, call the rules and the service, redirect. |
| `<name>-page.tsx` | The page the route renders. |
| other `.tsx` | Components that only this feature uses (forms, buttons). |
| `*.test.ts` | Tests next to what they test: `rules.test.ts`, `service.test.ts`. |

Features: `accounts`, `auth`, `budget`, `catalog` (the `/categories` page), `dashboard` (the home page), `expenses`, `incomes`, `savings`, `transfers`.

Exceptions: `accounts` has no `actions.ts` because it only reads data, `dashboard` is only a page, and `auth` has its own file names (`allowlist`, `errors`, `server`, `client`, `session`, `sign-out-button`, `login-page`, `login-error-page`) because it is not a data feature.

## Routes

A file in `src/app/` only re-exports the page of its feature:

```ts
// src/app/(app)/expenses/page.tsx
export { default } from "@/features/expenses/expenses-page";
```

The sidebar and the `(app)` layout stay in `src/app/(app)/` because only that layout uses them.

## Rules to keep it readable

- Helpers used by several features go in `src/shared/`, never inside one feature.
- A feature may import another feature (for example `incomes` uses `expectedReimbursement` from `expenses/rules`), but keep it to what you need and avoid cycles.
- Files that the Node test runner imports (`rules.ts`, `service.ts` and what they import) use relative paths with the `.ts` extension, because Node does not resolve the `@/` alias. Files that only Next compiles can use `@/`.
- Tests run with `node --test "src/**/*.test.ts"`. Keep the glob quoted: unquoted, `sh` expands `**` as a single folder level and skips tests in nested folders.
- When you add a feature, copy the layout above; when you add a page, add it to `NAV_ITEMS` in the sidebar.
