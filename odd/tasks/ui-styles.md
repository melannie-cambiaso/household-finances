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

- [ ] 1. Design tokens and font (globals.css, root layout), dark only
- [ ] 2. App shell with sidebar: `(app)` route group, move home and expenses into it
- [ ] 3. Restyle home, expenses (cards, pill buttons, month navigation, amount colors) and login
- [ ] 4. Check screenshots of every page, tune, README note and close

## Commits

(one work-unit commit per task, recorded here)
