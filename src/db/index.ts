import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  // Neon's pooled endpoint runs PgBouncer in transaction mode, which does not
  // support prepared statements.
  return postgres(url, { prepare: false });
}

// Reuse the connection across hot reloads in development.
const sql = globalForDb.sql ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalForDb.sql = sql;
}

export const db = drizzle(sql, { schema });
