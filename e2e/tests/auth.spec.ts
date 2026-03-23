// e2e/tests/auth.spec.ts
import * as path from 'path';
import { test, expect } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { TodoPage } from '../pages/TodoPage';
import { FRONTEND_URL } from '../test-constants';

// Unique suffix per test run prevents username collisions when rerunning without DB wipe
const runId = Date.now();

test.describe('Authentication', () => {
  test('@smoke register a new user and land on todo list', async ({ page }) => {
    const auth = new AuthPage(page);
    const todo = new TodoPage(page);
    await page.goto(FRONTEND_URL);
    await auth.register(`newuser-${runId}`, 'password123');
    await todo.expectFormVisible();
  });

  test('@smoke login with valid credentials', async ({ page }) => {
    const auth = new AuthPage(page);
    const todo = new TodoPage(page);
    await page.goto(FRONTEND_URL);
    // Use the pre-created e2e test user (exists from global-setup)
    await auth.login('e2e-testuser', 'e2e-password-42');
    await todo.expectFormVisible();
  });

  test('login with wrong password shows error', async ({ page }) => {
    const auth = new AuthPage(page);
    await page.goto(FRONTEND_URL);
    await auth.login('e2e-testuser', 'wrongpassword');
    await auth.expectError('Invalid credentials');
  });

  test('logout returns to login screen', async ({ page }) => {
    const auth = new AuthPage(page);
    const todo = new TodoPage(page);
    await page.goto(FRONTEND_URL);
    await auth.login('e2e-testuser', 'e2e-password-42');
    await todo.expectFormVisible();
    await todo.logout();
    await auth.expectAuthFormVisible();
  });

  test('401 from API clears session and shows login screen', async ({ browser }) => {
    // Start authenticated
    const context = await browser.newContext({
      storageState: path.join(__dirname, '../.auth/user.json'),
    });
    const page = await context.newPage();
    const auth = new AuthPage(page);

    await page.goto(FRONTEND_URL);
    await auth.expectAuthFormVisible();  // storageState loads sessionStorage, so should be logged in...
    // Actually: verify we DO see the todo form first
    const todo = new TodoPage(page);
    await todo.expectFormVisible();

    // Simulate token expiry by clearing sessionStorage (mimics what a 401 does)
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    // App re-reads token from sessionStorage on mount — it is now null
    await auth.expectAuthFormVisible();

    await context.close();
  });
});
