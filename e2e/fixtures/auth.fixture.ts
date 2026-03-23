// e2e/fixtures/auth.fixture.ts
import { test as base, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '../.auth/user.json');

type AuthFixtures = {
  authenticatedPage: Page;
  authenticatedContext: BrowserContext;
};

export const test = base.extend<AuthFixtures>({
  authenticatedContext: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    await use(context);
    await context.close();
  },
  authenticatedPage: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
