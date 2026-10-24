# Feature: continuous integration

Goal: a GitHub Actions workflow that checks every pull request, and a protection rule on `main` that blocks the merge when a check fails.

Decision (user): "Estricto, también para vos" — `main` requires a pull request and every required check to pass, with no exception for the repository admin.

Out of scope: deploys (Vercel already deploys), release automation, dependency update bots, code coverage, notifications.

Branch: `ci/github-actions`

## Specs

- S1: "podríamos implementar CI en este proyecto, para poder bloquear el merge si no pasa" (user, L1)
- S2: A merge into `main` is blocked while any required check fails, and the block also applies to the admin (L2).
- S3: The checks are the ones already run by hand before every pull request: lint, type check, the unit tests, the integration tests against a database, and the production build.
- S4: The checks never need a real secret and never touch the real or the test Neon database: the integration tests run against a Postgres created by the CI run itself, with the migrations applied from an empty database.
- S5: Pushing a failing change must visibly block the merge, and the block must be seen working, not assumed.

## Design decisions (mine, not the user's; change them if you disagree)

- One workflow `CI` that runs on every pull request to `main` and on every push to `main`, with three jobs named `Quality`, `Tests (Postgres)` and `Build`. The job names are what the protection rule requires.
- `Quality`: lint, type check, unit tests. `Tests (Postgres)`: Postgres 17 service, `pnpm db:migrate` from scratch, then the full suite with `TEST_DATABASE_URL` set. `Build`: `pnpm build` with fake environment variables.
- Node 24 and the pnpm version from `packageManager`, installed with `--frozen-lockfile`.
- The fake variables of the `Build` job are plain values in the workflow, not secrets: the build never connects to the database.
- The jobs get read-only repository permissions, and a new push cancels the run of the same branch that is still going.
- The rule requires a pull request with no approvals (a personal repository cannot approve its own), the three checks, and does not require the branch to be up to date.
- The Vercel check is not required: it is a deploy preview, not a test.

## Tasks

- T1 (S3): workflow with the `Quality` job; the same commands run locally. Route: inline. Commit: pending.
- T2 (S3, S4): `Build` job; the build run locally with fake variables. Route: inline. Commit: pending.
- T3 (S3, S4): `Tests (Postgres)` job. It cannot be run locally; it is seen on GitHub. Route: inline. Commit: pending.
- T4 (S3, S4): push, open the pull request and watch the first run: the three jobs green. Route: inline. Commit: pending.
- T5 (S2, S5): the protection rule on `main` through the GitHub API, and a throwaway pull request with a failing test to see the merge blocked; it is closed and its branch deleted afterwards. Route: inline. Commit: none (repository setting).
- T6: README section and close with a "Not verified" list. Route: inline. Commit: pending.

## Commits

(none yet)

## Log

- L1 (user): "podríamos implementar CI en este proyecto, para poder bloquear el merge si no pasa"
- L2 (user): chose "Estricto, también para vos": no bypass for the admin.

## Not verified

(to fill when the feature closes)
