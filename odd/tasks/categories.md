# Feature: categories

Goal: let the household create, rename, move and delete the categories and items of the budget, from a page at `/categories`, because the ones that exist (the seed data) do not match the real budget.

Out of scope: archiving, income sources, accounts, reordering, merging two items, a history of changes.

Branch: `feat/categories`

## Specs

- S1: "Categories group items (Subscriptions → Claude). Spending is always recorded against an **item**; a category total is the sum of its items." (docs/data-model.md)
- S2: "Simple categories (Groceries) get a single item so the model stays uniform." (docs/data-model.md)
- S3: "items: reimbursement_pct (integer 0-100, null = not reimbursable)" (docs/data-model.md)
- S4: "Frozen percentage: `reimbursement_pct` is copied from the item into the expense when it is created, so later changes never rewrite history." (docs/data-model.md)
- S5: "lo que quiero hacer ahora es que las categorías e items del presupuesto se puedan editar porque las que hay actualmente no concuerdan con mi presupuesto real" (user, L1)
- S6: Deleting an item or category that already has history: "Bloquear y explicar" — only those without history can be deleted; otherwise the app refuses and suggests renaming or moving the expenses to another item. No archiving, no migration (user, L2).
- S7: Scope: "Categorías e ítems" — create, rename and delete categories and items, change an item's reimbursement percentage and move it to another category; income sources are not included (user, L2).

## Design decisions (mine, not the user's; change them if you disagree)

- An item cannot be deleted while any expense or budget line points to it; a category cannot be deleted while it has items. The message says how many records block it.
- Changing an item's percentage does not touch existing expenses (S4). Moving an item to another category regroups its past months in the totals, because a category total is derived from its items (S1); the page says so.
- Names are trimmed, 1 to 60 characters. A category name must be unique in the household and an item name unique in its category, compared ignoring upper and lower case, with a friendly error. There is no database constraint, so the household row is locked while a name is checked and written: two simultaneous creations cannot both pass the check.
- The percentage is a whole number from 0 to 100, or blank for not reimbursable (S3).
- Same security model as the other pages: the Server Actions re-check the session; the household comes from the session, never the form; every id sent by the form must belong to the household.
- The page works with whatever exists, including an empty household, so the seed data can be removed entirely and replaced.
- Pure logic in `src/lib/catalog.ts`, services in `src/lib/catalog-service.ts`, integration tests gated by `TEST_DATABASE_URL`. UI copy in English.

## Tasks

- [x] 1. Pure logic (`src/lib/catalog.ts`): validate category names and item input, name comparison — test-first (S3, S7)
- [x] 2. Category service: list with items, create, rename, delete with usage rule — test-first with integration test (S1, S6)
- [x] 3. Item service: create, update (rename, percentage, move), delete with usage rule — test-first with integration test (S3, S4, S6)
- [ ] 4. Server Actions and the `/categories` page with a sidebar entry
- [ ] 5. README and close

## Commits

(one work-unit commit per task, recorded here)
- Task 1: `921f885` feat: add category and item validation. RED (module not found), GREEN 88/88 without a database (75 existing + 13 new): names are trimmed, blank refused, exactly 60 characters accepted and 61 refused (counted after trimming); duplicate detection ignores case and repeated spaces; a blank percentage means not reimbursable, 0 and 100 are accepted, and 101, -1, 70.5, 70%, abc, 1e2 and 07x are refused with the error on the percentage only; every invalid field is reported at once. tsc and lint clean.
- Task 2: `9f78b11` feat: add category service with duplicate and usage rules. RED (module not found), GREEN 9/9 on the Neon branch copy: create; a duplicate ignoring case and spaces is refused with nothing inserted; the same name is allowed in two households; rename, including changing only the case of its own name; renaming onto another category's name is refused and changes nothing; another household's category cannot be renamed or deleted and survives; an empty category is deleted; one with items is refused saying how many. The household row is locked while a name is checked and written. Full suite 158/158, tsc and lint clean, 0 leftover rows. The lock itself is not raced by a test.
- Task 3: `4506889` feat: add item service and catalog listing with usage counts. RED (createItem not exported), GREEN 21/21 on the Neon branch copy (9 category tests + 12 item tests): create with or without a percentage; a category of another household refused with nothing inserted; a duplicate name refused in the same category but allowed in another; rename, change the percentage and move to another category; changing the percentage never rewrites the one already frozen in existing expenses; only the case of its own name may change but a sibling's name is refused; moving into a category that already has that name refused; another household's item cannot be updated or deleted and a category of another household cannot receive it; an unused item is deleted; one with expenses or budget lines is refused counting both; the catalog lists categories and items by name with usage counts, includes empty categories and only this household's data. Full suite 170/170, tsc and lint clean, 0 leftover rows.

## Log

- L1 (user): "listo, ahora si está funcionando, lo que quiero hacer ahora es que las categorías e items del presupuesto se puedan editar porque las que hay actualmente no concuerdan con mi presupuesto real" — right after the Vercel deployment worked.
- L2 (user): chose "Bloquear y explicar" for deleting items or categories that have history, and "Categorías e ítems" as the scope of this delivery.
