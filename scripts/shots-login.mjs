// Opens your installed Chrome on the app's login page with a profile that lives in
// .auth/ (gitignored). Sign in with Google once and close the window: `pnpm shots`
// reuses that profile. Chrome is launched as a normal browser, not driven by
// automation, because Google tends to refuse sign-ins from automated browsers.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const base = process.env.SHOTS_URL ?? "http://localhost:3000";
const profile = resolve(".auth", "profile");

const candidates = [
  process.env.CHROME_PATH,
  join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env["PROGRAMFILES(X86)"] ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);
const chrome = candidates.find((path) => existsSync(path));
if (!chrome) {
  console.error("Chrome not found. Set CHROME_PATH to its executable.");
  process.exit(1);
}

mkdirSync(profile, { recursive: true });
console.log(`Opening Chrome on ${base}/login. Sign in, then close the window.`);
const child = spawn(chrome, [`--user-data-dir=${profile}`, "--no-first-run", `${base}/login`], {
  stdio: "ignore",
});
child.on("exit", () => console.log("Done. Now run: pnpm shots"));
