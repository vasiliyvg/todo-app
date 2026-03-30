// e2e/fixtures/auth.fixture.ts
import { test as base, BrowserContext, Page } from '@playwright/test';
import { TEST_USER, BACKEND_URL } from '../test-constants';

type AuthFixtures = {
  authenticatedPage: Page;
  authenticatedContext: BrowserContext;
};

async function getTestToken(): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username: TEST_USER.username,
      password: TEST_USER.password,
    }),
  });
  if (!res.ok) throw new Error(`auth.fixture login failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export const test = base.extend<AuthFixtures>({
  authenticatedContext: async ({ browser }, use) => {
    const token = await getTestToken();
    const context = await browser.newContext();
    // Inject the token into sessionStorage before any page script runs
    await context.addInitScript((t: string) => {
      sessionStorage.setItem('token', t);
    }, token);
    await use(context);
    await context.close();
  },
  authenticatedPage: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close(); // explicit close before context ensures proper Playwright teardown ordering
  },
});

export { expect } from '@playwright/test';
