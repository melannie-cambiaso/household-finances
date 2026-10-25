// Runs the full test suite, including the integration tests, against a throwaway
// Postgres. Asks for the connection string unless TEST_DATABASE_URL is already set.
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

let url = process.env.TEST_DATABASE_URL?.trim();

if (!url) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  url = (
    await rl.question("TEST_DATABASE_URL (throwaway database, never your real one): ")
  ).trim();
  rl.close();
}

if (!url) {
  console.error("No database URL given. Aborting.");
  process.exit(1);
}

const result = spawnSync("pnpm", ["test"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, TEST_DATABASE_URL: url },
});
process.exit(result.status ?? 1);
