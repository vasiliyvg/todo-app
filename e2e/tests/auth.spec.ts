// e2e/tests/auth.spec.ts
import { test, expect } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { TodoPage } from '../pages/TodoPage';
import { FRONTEND_URL } from '../test-constants';

test.describe('Authentication', () => {
  test('@smoke register a new user and land on todo list', async ({ page }) => {
    const runId = Date.now(); // inside the test to ensure uniqueness on retry
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
    const { AUTH_FILE } = await import('../test-constants');
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();
    const auth = new AuthPage(page);
    const todo = new TodoPage(page);

    try {
      await page.goto(FRONTEND_URL);
      await todo.expectFormVisible();

      // Intercept the next /todos request and return 401 to simulate token expiry
      await page.route('**/todos', route =>
        route.fulfill({ status: 401, body: JSON.stringify({ detail: 'Unauthorized' }) })
      );

      // Reload triggers fetchTodos which hits the intercepted route
      await page.reload();

      // App's handleUnauthorized clears the token and renders AuthForm
      await auth.expectAuthFormVisible();
    } finally {
      await context.close();
    }
  });
});
