// e2e/global-setup.ts
import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_USER, BACKEND_URL, FRONTEND_URL } from './test-constants';

const AUTH_FILE = path.join(__dirname, '.auth/user.json');
const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 60_000;

async function waitForService(url: string, label: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`[global-setup] ${label} ready`);
        return;
      }
    } catch {
      // not ready yet — swallow and retry
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`[global-setup] Timed out after ${TIMEOUT_MS}ms waiting for ${label} at ${url}`);
}

async function ensureTestUserExists(): Promise<void> {
  // Register — ignore 409 if user already exists
  await fetch(`${BACKEND_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USER.username, password: TEST_USER.password }),
  });
}

export default async function globalSetup(_config: FullConfig) {
  // 1. Wait for both services to be healthy
  await waitForService(`${BACKEND_URL}/`, 'backend');
  await waitForService(FRONTEND_URL, 'frontend');

  // 2. Ensure the test user exists in the DB
  await ensureTestUserExists();

  // 3. Log in via the UI and save storageState (captures sessionStorage with token)
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(FRONTEND_URL);
  await page.getByPlaceholder('Username').fill(TEST_USER.username);
  await page.getByPlaceholder('Password').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Log In' }).click();

  // Wait until past the auth gate
  await page.getByPlaceholder('Add a new task...').waitFor({ timeout: 15_000 });

  await context.storageState({ path: AUTH_FILE });
  await browser.close();

  console.log('[global-setup] storageState saved to', AUTH_FILE);
}
