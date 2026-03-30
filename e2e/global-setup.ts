import { FullConfig } from '@playwright/test';
import * as path from 'path';
import { TEST_USER, BACKEND_URL, FRONTEND_URL } from './test-constants';

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
    if (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
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
  await waitForService(`${BACKEND_URL}/`, 'backend');
  await waitForService(FRONTEND_URL, 'frontend');
  await ensureTestUserExists();
  console.log('[global-setup] services ready, test user ensured');
}
