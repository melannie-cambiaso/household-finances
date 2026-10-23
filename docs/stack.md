# Stack Decisions

| Layer | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js (TypeScript) | Already known from the previous project; keeps the focus on the domain. |
| Hosting | Vercel | Already used; reachable from phone. |
| Database | Postgres on Neon | Plain Postgres, free tier, one-click Vercel integration. |
| ORM | Drizzle | SQL-like schema in TypeScript, supports `CHECK` constraints (needed by `budget_lines`), exposes the generated SQL. |
| Auth | Better Auth + Google login | No password management, official Drizzle adapter, users live in our own database. |

## Access rule

Sign-up is closed. Only an allowlist of two emails (the household members) can log in.
