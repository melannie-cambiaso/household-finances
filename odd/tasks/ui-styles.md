# Feature: ui-styles

Goal: give the app the look of the user's previous project (screenshot, replicated by eye): warm dark theme, rounded handwritten-style font, rounded cards, pill buttons, a left sidebar and a centered column.

Decision: the user has no code for the previous project, so colors, font and radii are approximated from the screenshot and tuned by looking at the result.

Out of scope: new pages or features (budget, summary, savings, wishlist from the old sidebar), Spanish UI copy (the UI stays in English), light theme, mobile navigation drawer beyond a simple stacked layout.

Branch: `feat/ui-styles`

## Design decisions (assumptions to confirm with the user)

- Dark theme only, matching the reference. The current light/dark switch by system preference is removed. Easy to bring back later by moving the tokens under a media query.
- The sidebar lists only pages that exist (Home, Expenses). No dead links for the old project's sections.
- Route group `(app)` holds the pages that show the shell (home, expenses); `/login` stays outside it. Route groups do not change URLs.
- Active nav item comes from the pathname in a small client component; the session check stays in each page (the shell is not a security boundary).
- Design tokens live in `src/app/globals.css` (`@theme`), so components use semantic names (`bg-surface`, `text-muted`, `text-income`...) instead of raw hex values.
- Font loaded with `next/font/google`; the exact font in the reference is unknown, so a close rounded handwritten one is chosen and can be swapped in one line.
- Colors for amounts follow the reference: green income, red expense, orange savings, blue transfers.

## Tasks

- [x] 1. Design tokens and font (globals.css, root layout), dark only
- [x] 2. App shell with sidebar: `(app)` route group, move home and expenses into it
- [x] 3. Restyle home, expenses (cards, pill buttons, month navigation, amount colors) and login; then, at the user's request, move "Add expense" into a modal
- [x] 4. Check screenshots of every page, tune, README note and close

## Commits

(one work-unit commit per task, recorded here)

- Task 1: `cb0943f` feat: add warm dark design tokens and rounded fonts. Checked with a screenshot of `/login` on a production build.
- Task 2: `a9d54dd` feat: add app shell with sidebar. Pages moved into the `(app)` route group with `git mv` (rename detected); routes unchanged in the build. A first attempt raced with parallel writes and left two pages for `/`; fixed before the commit.
- Task 3: `4268929` feat: restyle expenses, form and login with the new design. `formatMonthLabel` added test-first (RED: export missing, GREEN 21/21).
- Task 3b (user request): `c360107` feat: open the expense form in a modal and keep select choices after errors. Native `<dialog>`; the form is remounted on every open.
- Task 4: `4deca22` docs: document the styling tokens and the app shell.

## Verification

Done on a throwaway local Postgres (migrations + `pnpm db:seed`) with a production build, never on the user's Neon. A temporary route minted a signed session cookie and created sample expenses; it was deleted before committing. A script drove headless Chrome through the DevTools protocol:

- sign-in lands on `/expenses`; the inline form is gone; the modal opens from the button
- `Esc` closes it; a click on the backdrop closes it; a click inside keeps it open
- an invalid amount shows an error and keeps the modal open; typed text, the chosen item and the chosen account are kept
- a valid submit closes the modal, the row appears, the row count grows by one, and the frozen reimbursement percentage (30%) is shown
- reopening gives a fresh form

Result: 16/16. This is also the first real exercise of the `createExpenseAction` Server Action with a session, which `feat/expenses` had left unverified.

## Bugs found by the browser check

- Selects lost the user's choice after a validation error (React does not apply a changed `defaultValue` to a mounted `<select>`). Present since `feat/expenses`. Fixed with a `key` that follows the value (RED: 2 failing checks, GREEN: 16/16).
- Two failures were in the check script itself (a race with React's form reset, and a `const` redeclared across evaluations), not in the app.

## Not verified

- The user's own eyes: colors, font and spacing are an approximation of a screenshot, to be tuned after the user sees them.
- The user's dev server needs a restart to serve the new CSS tokens (it kept serving the old CSS).
- Mobile layout beyond a stacked sidebar; light theme (removed on purpose); Safari/Firefox.
- The sidebar and `/` page were seen only in screenshots of `/expenses`; `/` itself was captured but not reviewed in detail.
