// Takes screenshots of the running app with the Chrome profile saved by
// `pnpm shots:login`, at a phone and a desktop size, into .shots/ (gitignored).
//
//   pnpm shots                 default pages
//   pnpm shots /expenses /     only those paths
//   pnpm shots --menu          also the phone view with the hamburger menu open
//
// Chrome must be closed: the profile cannot be shared with a running window.
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.SHOTS_URL ?? "http://localhost:3000";
const profile = resolve(".auth", "profile");
const outDir = resolve(".shots");

const args = process.argv.slice(2);
const withMenu = args.includes("--menu");
const paths = args.filter((arg) => arg.startsWith("/"));
const pages = paths.length > 0 ? paths : [
  "/login", "/", "/expenses", "/incomes", "/budget", "/categories", "/transfers", "/savings",
];

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
];

if (!existsSync(profile)) {
  console.error("No saved session. Run `pnpm shots:login` first.");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const slug = (path) => (path === "/" ? "home" : path.slice(1).replaceAll("/", "-"));

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
});

let failed = false;
try {
  for (const viewport of viewports) {
    const page = await context.newPage();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of pages) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      if (path !== "/login" && new URL(page.url()).pathname === "/login") {
        console.error(`${path}: redirected to /login, the saved session is missing or expired.`);
        failed = true;
        continue;
      }
      const file = resolve(outDir, `${slug(path)}-${viewport.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);

      if (withMenu && viewport.name === "phone" && path !== "/login") {
        await page.getByRole("button", { name: "Open menu" }).click();
        const menuFile = resolve(outDir, `${slug(path)}-phone-menu.png`);
        await page.screenshot({ path: menuFile });
        console.log(menuFile);
      }
    }
    await page.close();
  }
} finally {
  await context.close();
}
process.exit(failed ? 1 : 0);
