// e2e/tests/auth.spec.ts
import { test, expect } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { TodoPage } from '../pages/TodoPage';
import { FRONTEND_URL, TEST_USER } from '../test-constants';

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
    await auth.login(TEST_USER.username, TEST_USER.password);
    await todo.expectFormVisible();
  });

  test('login with wrong password shows error', async ({ page }) => {
    const auth = new AuthPage(page);
    await page.goto(FRONTEND_URL);
    await auth.login(TEST_USER.username, 'wrongpassword');
    await auth.expectError('Invalid credentials');
  });

  test('logout returns to login screen', async ({ page }) => {
    const auth = new AuthPage(page);
    const todo = new TodoPage(page);
    await page.goto(FRONTEND_URL);
    await auth.login(TEST_USER.username, TEST_USER.password);
    await todo.expectFormVisible();
    await todo.logout();
    await auth.expectAuthFormVisible();
  });

  test('401 from API clears session and shows login screen', async ({ browser }) => {
    // Start authenticated — inject token into sessionStorage since app uses sessionStorage
    const { BACKEND_URL, TEST_USER } = await import('../test-constants');
    const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: TEST_USER.username, password: TEST_USER.password }),
    });
    const { access_token } = await loginRes.json();
    const context = await browser.newContext();
    await context.addInitScript((t: string) => { sessionStorage.setItem('token', t); }, access_token);
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
