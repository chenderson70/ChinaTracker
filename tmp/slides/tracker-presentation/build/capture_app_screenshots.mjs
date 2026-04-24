import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PLAYWRIGHT_PATH = "C:/Users/culle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const { chromium, request } = await import(pathToFileURL(PLAYWRIGHT_PATH).href);
const EDGE_PATH = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const OUT_DIR = path.resolve("tmp/slides/tracker-presentation/screenshots");
const APP_URL = "http://localhost:5173/#/";
const API_URL = "http://localhost:3001/api/v1/auth/login";

async function ensureDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function loginAndGetSession() {
  const context = await request.newContext();
  const response = await context.post(API_URL, {
    data: {
      username: "admin",
      password: "Password1111!!!!",
    },
  });
  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${response.statusText()}`);
  }
  const data = await response.json();
  await context.dispose();
  return data;
}

async function injectSession(page, session) {
  await page.addInitScript((auth) => {
    localStorage.setItem("chinaTracker.authToken", auth.token);
    localStorage.setItem("chinaTracker.refreshToken", auth.refreshToken);
    localStorage.setItem("chinaTracker.authUser", JSON.stringify(auth.user));
  }, session);
}

async function goAndShoot(page, route, fileName, waitFor = 1600) {
  await page.goto(`http://localhost:5173/#/${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(waitFor);
  await page.screenshot({
    path: path.join(OUT_DIR, fileName),
    fullPage: false,
  });
}

await ensureDir();
const session = await loginAndGetSession();
const browser = await chromium.launch({ headless: true, executablePath: EDGE_PATH });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await injectSession(page, session);
await page.goto(APP_URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);

await goAndShoot(page, "", "dashboard.png", 2200);
await goAndShoot(page, "units/A7", "unit-a7.png", 2200);
await goAndShoot(page, "reports/balance", "reports-balance.png", 2200);
await goAndShoot(page, "reports/refinements", "refinements.png", 1600);

await browser.close();
console.log(`Saved screenshots to ${OUT_DIR}`);
