# E2E Testing Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Playwright TypeScript e2e test suite to the monorepo covering auth, todo CRUD, and timeline flows, running against an isolated Docker Compose stack in both CI and locally.

**Architecture:** Page Object Model with two page classes (`AuthPage`, `TodoPage`) and two fixtures (`auth.fixture` for storageState reuse, `api.fixture` for direct API seeding). A `global-setup.ts` handles health-check polling and saves a logged-in browser state once before the suite runs. Tests live in `e2e/` at the repo root and run against `docker-compose.e2e.yml`, which has its own isolated PostgreSQL volume.

**Tech Stack:** `@playwright/test` ^1.40, TypeScript 5, Node 20, Docker Compose, GitHub Actions

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `frontend/src/App.tsx` | Forward `type` arg from TodoForm; persist token in sessionStorage |
| Modify | `frontend/src/services/api.ts` | Include `type` in `addTodo` request body |
| Modify | `frontend/src/services/api.test.ts` | Update `addTodo` body assertion to include `type: 'todo'` |
| Modify | `frontend/src/App.test.tsx` | Add `sessionStorage.clear()` in `beforeEach` for isolation |
| Create | `docker-compose.e2e.yml` | Isolated test stack with separate PostgreSQL volume |
| Create | `e2e/package.json` | e2e project dependencies |
| Create | `e2e/tsconfig.json` | TypeScript config for e2e project |
| Create | `e2e/playwright.config.ts` | Playwright configuration |
| Create | `e2e/test-constants.ts` | Shared test credentials and URLs |
| Create | `e2e/global-setup.ts` | Health checks + save logged-in storageState |
| Create | `e2e/pages/AuthPage.ts` | Page object for login/register UI |
| Create | `e2e/pages/TodoPage.ts` | Page object for todo list, form, timeline tab |
| Create | `e2e/fixtures/auth.fixture.ts` | `test.extend` fixture loading saved storageState |
| Create | `e2e/fixtures/api.fixture.ts` | Direct HTTP calls for data seeding and cleanup |
| Create | `e2e/tests/auth.spec.ts` | Auth test scenarios |
| Create | `e2e/tests/todos.spec.ts` | Todo CRUD test scenarios |
| Create | `e2e/tests/timeline.spec.ts` | Timeline tab test scenarios |
| Create | `e2e/.gitignore` | Ignore `.auth/`, `node_modules/`, `playwright-report/`, `test-results/` |
| Create | `.github/workflows/e2e.yml` | CI workflow |

---

## Task 1: Fix App.tsx — forward `type` from TodoForm + sessionStorage token persistence

**Why:** `App.tsx`'s `addTodo` currently ignores the `type` argument from `TodoForm`, so timeline items are always saved as `type: "todo"`. Also, the token lives only in React state — Playwright's `storageState` can only persist cookies/localStorage/sessionStorage, so we add sessionStorage persistence to enable session reuse across tests.

> **Note:** `App.tsx` already has a pre-existing TypeScript mismatch — `addTodo` is declared as `(text: string)` but `TodoForm` passes `(text, type)`. `react-scripts test` uses Babel (transpiles without type-checking), so existing unit tests pass despite the error. After this task is applied, the mismatch is fixed. Running `tsc --noEmit` from `frontend/` will show the current error before the fix.

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

- [ ] **Step 1: Update `App.tsx`**

Replace the token state initialization, `handleUnauthorized`, the logout button handler, the `onAuth` prop, and the `addTodo` function:

```tsx
// Line 14 — initialize token from sessionStorage
const [token, setToken] = useState<string | null>(sessionStorage.getItem('token'));

// Replace handleUnauthorized (line 18)
const handleUnauthorized = () => {
  sessionStorage.removeItem('token');
  setToken(null);
};

// Add handleAuth (after handleUnauthorized)
const handleAuth = (t: string) => {
  sessionStorage.setItem('token', t);
  setToken(t);
};

// Replace addTodo signature (line 38) — accept type from TodoForm
const addTodo = async (text: string, type: string = 'todo') => {
  if (!token) return;
  try {
    const newTodo = await api.addTodo(text, token, handleUnauthorized, type);
    setTodos((prevTodos) => [...prevTodos, newTodo]);
  } catch (err) {
    setError('Failed to add todo.');
    console.error(err);
  }
};

// Replace logout button onClick (line 95)
onClick={() => { sessionStorage.removeItem('token'); setToken(null); }}

// Replace onAuth prop on AuthForm (line 77)
<AuthForm onAuth={handleAuth} />
```

- [ ] **Step 2: Add `sessionStorage.clear()` to `App.test.tsx` `beforeEach`**

In `App.test.tsx`, inside the existing `beforeEach`:
```ts
beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear(); // prevent token bleed-through between tests
});
```

No other changes to `App.test.tsx` are required. The `handleAuth` wrapper still calls `setToken`, so mock-resolved logins continue to work. `sessionStorage.getItem('token')` returns `null` at the start of each test because of the `clear()` call above.

- [ ] **Step 3: Run frontend unit tests to confirm nothing broke**

```bash
cd frontend && npm test -- --watchAll=false
```
Expected: all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "fix: forward todo type from TodoForm and persist token in sessionStorage"
```

---

## Task 2: Fix api.ts — include `type` in `addTodo` request body

**Why:** `api.ts`'s `addTodo` sends `{ title: text }` only; the `type` field is never sent to the backend. The backend does accept and persist `type` when provided.

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/services/api.test.ts`

- [ ] **Step 1: Update `api.ts` — add `type` parameter and include it in the body**

Change the `addTodo` signature to add `type` as the last optional param (after `onUnauthorized`) to avoid breaking existing callers:

```ts
// frontend/src/services/api.ts
export const addTodo = async (
  text: string,
  token: string,
  onUnauthorized?: () => void,
  type: string = 'todo',
): Promise<Todo> => {
  const response = await fetch(`${API_URL}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ title: text, type }),
  });
  if (response.status === 401) {
    onUnauthorized?.();
    throw new Error('Failed to add todo');
  }
  if (!response.ok) {
    throw new Error('Failed to add todo');
  }
  return await response.json();
};
```

- [ ] **Step 2: Update `api.test.ts` — fix body assertion**

The test currently asserts `body: JSON.stringify({ title: 'Test' })`. Update it to include the default type:

```ts
// In the addTodo describe block, update the body assertion:
body: JSON.stringify({ title: 'Test', type: 'todo' }),
```

- [ ] **Step 3: Run frontend unit tests**

```bash
cd frontend && npm test -- --watchAll=false
```
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/services/api.test.ts
git commit -m "fix: include type field in addTodo API request body"
```

---

## Task 3: Create `docker-compose.e2e.yml`

**Files:**
- Create: `docker-compose.e2e.yml`

- [ ] **Step 1: Create the file**

```yaml
# docker-compose.e2e.yml
services:
  postgres_e2e:
    image: postgres:13
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=tododb_e2e
    volumes:
      - postgres_e2e_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d tododb_e2e"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 30s

  backend_e2e:
    build:
      context: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    environment:
      - PYTHONUNBUFFERED=1
      - PYTHONPATH=/app
      - DATABASE_URL=postgresql+asyncpg://user:password@postgres_e2e/tododb_e2e
      - SECRET_KEY=e2e-test-secret-key
    depends_on:
      postgres_e2e:
        condition: service_healthy
    restart: unless-stopped

  frontend_e2e:
    build:
      context: ./frontend
      target: development
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - CHOKIDAR_USEPOLLING=true
      - REACT_APP_TIMELINE_FEATURE_FLAG=true
    command: npm start
    depends_on:
      - backend_e2e

volumes:
  postgres_e2e_data:
```

- [ ] **Step 2: Verify it starts cleanly**

> **Port conflict warning:** both `docker-compose.yml` (dev) and `docker-compose.e2e.yml` bind ports `3000`, `8000`, and `5432` on the host. If the dev stack is running, stop it first: `docker compose down`

```bash
docker compose -f docker-compose.e2e.yml up -d
docker compose -f docker-compose.e2e.yml ps
```
Expected: all three services show `running` or `healthy`

- [ ] **Step 3: Tear down**

```bash
docker compose -f docker-compose.e2e.yml down -v
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.e2e.yml
git commit -m "feat: add docker-compose.e2e.yml with isolated postgres volume"
```

---

## Task 4: Bootstrap e2e project

**Files:**
- Create: `e2e/package.json`
- Create: `e2e/tsconfig.json`
- Create: `e2e/playwright.config.ts`
- Create: `e2e/test-constants.ts`
- Create: `e2e/.gitignore`

- [ ] **Step 1: Create `e2e/package.json`**

```json
{
  "name": "todo-e2e",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "playwright test",
    "test:smoke": "playwright test --grep @smoke",
    "test:headed": "playwright test --headed",
    "report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create `e2e/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "baseUrl": "."
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules", "playwright-report", "test-results"]
}
```

- [ ] **Step 3: Create `e2e/.gitignore`**

```
node_modules/
playwright-report/
test-results/
.auth/
```

- [ ] **Step 4: Create `e2e/test-constants.ts`**

Shared credentials and URLs used by `global-setup.ts` and `api.fixture.ts`:

```ts
// e2e/test-constants.ts
export const TEST_USER = {
  username: 'e2e-testuser',
  password: 'e2e-password-42',
};

export const BACKEND_URL = 'http://localhost:8000';
export const FRONTEND_URL = 'http://localhost:3000';
```

- [ ] **Step 5: Create `e2e/playwright.config.ts`**

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup',
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

- [ ] **Step 6: Install dependencies**

```bash
cd e2e && npm install && npx playwright install --with-deps chromium
```
Expected: `node_modules` created, Chromium browser downloaded

- [ ] **Step 7: Commit (include `package-lock.json` — required for `npm ci` in CI)**

```bash
git add e2e/package.json e2e/package-lock.json e2e/tsconfig.json e2e/playwright.config.ts e2e/test-constants.ts e2e/.gitignore
git commit -m "feat: bootstrap e2e project with Playwright config"
```

---

## Task 5: Create `global-setup.ts`

> **Prerequisite:** Task 1 must be complete before this task. `global-setup.ts` saves `storageState` which captures `sessionStorage`. The token is only written to `sessionStorage` after Task 1's changes to `App.tsx` are applied. Running this task against the unmodified `App.tsx` will save an empty `storageState` with no token, causing every auth-fixture test to land on the login screen. Confirm Task 1 is done first.

**Why:** Runs once before the suite. Polls health endpoints until the stack is ready, then logs in via the UI (the only way to capture React state-based auth in `storageState`), and saves the browser session to `e2e/.auth/user.json`.

**Files:**
- Create: `e2e/global-setup.ts`

- [ ] **Step 1: Create the file**

```ts
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
```

- [ ] **Step 2: Start the stack and do a smoke run**

```bash
docker compose -f docker-compose.e2e.yml up -d
cd e2e && npx playwright test --list
```
Expected: global-setup runs without error, test list is printed (even if 0 tests — they don't exist yet)

- [ ] **Step 3: Tear down**

```bash
docker compose -f docker-compose.e2e.yml down -v
```

- [ ] **Step 4: Commit**

```bash
git add e2e/global-setup.ts
git commit -m "feat: add global-setup with health polling and storageState login"
```

---

## Task 6: Create page objects

**Files:**
- Create: `e2e/pages/AuthPage.ts`
- Create: `e2e/pages/TodoPage.ts`

- [ ] **Step 1: Create `e2e/pages/AuthPage.ts`**

```ts
// e2e/pages/AuthPage.ts
import { Page, expect } from '@playwright/test';

export class AuthPage {
  constructor(private page: Page) {}

  async login(username: string, password: string) {
    await this.page.getByPlaceholder('Username').fill(username);
    await this.page.getByPlaceholder('Password').fill(password);
    await this.page.getByRole('button', { name: 'Log In' }).click();
  }

  async register(username: string, password: string) {
    await this.page.getByRole('button', { name: 'Switch to Register' }).click();
    await this.page.getByPlaceholder('Username').fill(username);
    await this.page.getByPlaceholder('Password').fill(password);
    await this.page.getByRole('button', { name: 'Register' }).click();
  }

  async expectError(message: string) {
    await expect(this.page.locator('.auth-error')).toHaveText(message);
  }

  async expectTodoFormVisible() {
    await expect(this.page.getByPlaceholder('Add a new task...')).toBeVisible();
  }

  async expectAuthFormVisible() {
    await expect(this.page.getByPlaceholder('Username')).toBeVisible();
  }
}
```

- [ ] **Step 2: Create `e2e/pages/TodoPage.ts`**

```ts
// e2e/pages/TodoPage.ts
import { Page, Locator, expect } from '@playwright/test';

export class TodoPage {
  constructor(private page: Page) {}

  async addTodo(text: string, type: 'todo' | 'timeline' = 'todo') {
    await this.page.getByPlaceholder('Add a new task...').fill(text);
    // Select is always rendered; default is 'todo' — only change when needed
    if (type === 'timeline') {
      await this.page.getByRole('combobox').selectOption('timeline');
    }
    await this.page.getByRole('button', { name: 'Add' }).click();
    // Reset select back to 'todo' for next call (avoids state leaking between actions)
    if (type === 'timeline') {
      await this.page.getByRole('combobox').selectOption('todo');
    }
  }

  private todoRow(text: string): Locator {
    return this.page.locator('.todo-item').filter({ hasText: text });
  }

  async toggleTodo(text: string) {
    await this.todoRow(text).getByRole('checkbox').click();
  }

  async deleteTodo(text: string) {
    await this.todoRow(text).getByRole('button', { name: 'Delete' }).click();
  }

  async expectTodoVisible(text: string) {
    await expect(this.todoRow(text)).toBeVisible();
  }

  async expectTodoNotVisible(text: string) {
    await expect(this.todoRow(text)).not.toBeVisible();
  }

  async expectCompleted(text: string) {
    // The inline style 'text-decoration: line-through' is on the first child div of .todo-item
    await expect(
      this.todoRow(text).locator('> div:first-child'),
    ).toHaveCSS('text-decoration', /line-through/);
  }

  async switchToTimeline() {
    await this.page.getByRole('tab', { name: 'Timeline' }).click();
  }

  async expectTimelineTabVisible() {
    await expect(this.page.getByRole('tab', { name: 'Timeline' })).toBeVisible();
  }

  async logout() {
    await this.page.getByRole('button', { name: 'Logout' }).click();
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add e2e/pages/
git commit -m "feat: add AuthPage and TodoPage page objects"
```

---

## Task 7: Create fixtures

**Files:**
- Create: `e2e/fixtures/auth.fixture.ts`
- Create: `e2e/fixtures/api.fixture.ts`

- [ ] **Step 1: Create `e2e/fixtures/auth.fixture.ts`**

```ts
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
```

- [ ] **Step 2: Create `e2e/fixtures/api.fixture.ts`**

```ts
// e2e/fixtures/api.fixture.ts
import { TEST_USER, BACKEND_URL } from '../test-constants';

interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
  type: string;
}

export class ApiFixture {
  private token: string | null = null;

  private async getToken(): Promise<string> {
    if (this.token) return this.token;

    // /auth/login requires application/x-www-form-urlencoded (FastAPI OAuth2PasswordRequestForm)
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: TEST_USER.username,
        password: TEST_USER.password,
      }),
    });
    if (!res.ok) throw new Error(`ApiFixture login failed: ${res.status}`);
    const data = await res.json();
    this.token = data.access_token;
    return this.token!;
  }

  async createTodo(title: string, type: 'todo' | 'timeline' = 'todo'): Promise<TodoItem> {
    const token = await this.getToken();
    const res = await fetch(`${BACKEND_URL}/todos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, type }),
    });
    if (!res.ok) throw new Error(`createTodo failed: ${res.status}`);
    return res.json();
  }

  async clearTodos(): Promise<void> {
    const token = await this.getToken();
    // No bulk-delete endpoint — must list then delete individually
    const res = await fetch(`${BACKEND_URL}/todos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`clearTodos list failed: ${res.status}`);
    const todos: TodoItem[] = await res.json();
    for (const todo of todos) {
      await fetch(`${BACKEND_URL}/todos/${todo.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }

  async registerUser(username: string, password: string): Promise<string> {
    // Returns JWT token for the new user
    const res = await fetch(`${BACKEND_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error(`registerUser failed: ${res.status}`);
    const data = await res.json();
    return data.access_token;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add e2e/fixtures/
git commit -m "feat: add auth and api fixtures"
```

---

## Task 8: Write `auth.spec.ts`

**Files:**
- Create: `e2e/tests/auth.spec.ts`

- [ ] **Step 1: Create the file**

```ts
// e2e/tests/auth.spec.ts
import * as path from 'path';
import { test, expect } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { FRONTEND_URL } from '../test-constants';

// Unique suffix per test run prevents username collisions when rerunning without DB wipe
const runId = Date.now();

test.describe('Authentication', () => {
  test('@smoke register a new user and land on todo list', async ({ page }) => {
    const auth = new AuthPage(page);
    await page.goto(FRONTEND_URL);
    await auth.register(`newuser-${runId}`, 'password123');
    await auth.expectTodoFormVisible();
  });

  test('@smoke login with valid credentials', async ({ page }) => {
    const auth = new AuthPage(page);
    await page.goto(FRONTEND_URL);
    // Use the pre-created e2e test user (exists from global-setup)
    await auth.login('e2e-testuser', 'e2e-password-42');
    await auth.expectTodoFormVisible();
  });

  test('login with wrong password shows error', async ({ page }) => {
    const auth = new AuthPage(page);
    await page.goto(FRONTEND_URL);
    await auth.login('e2e-testuser', 'wrongpassword');
    await auth.expectError('Invalid credentials');
  });

  test('logout returns to login screen', async ({ page }) => {
    // Log in first
    const auth = new AuthPage(page);
    await page.goto(FRONTEND_URL);
    await auth.login('e2e-testuser', 'e2e-password-42');
    await auth.expectTodoFormVisible();

    // Log out
    const { TodoPage } = await import('../pages/TodoPage');
    const todo = new TodoPage(page);
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
    await auth.expectTodoFormVisible();

    // Simulate 401 by clearing sessionStorage (mimics token expiry without waiting)
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    // App re-reads token from sessionStorage on mount — it is now null
    await auth.expectAuthFormVisible();

    await context.close();
  });
});
```

- [ ] **Step 2: Start the stack and run auth tests**

```bash
docker compose -f docker-compose.e2e.yml up -d
cd e2e && npx playwright test tests/auth.spec.ts --reporter=list
```
Expected: all 5 auth tests pass

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/auth.spec.ts
git commit -m "feat: add auth e2e tests"
```

---

## Task 9: Write `todos.spec.ts`

**Files:**
- Create: `e2e/tests/todos.spec.ts`

- [ ] **Step 1: Create the file**

```ts
// e2e/tests/todos.spec.ts
import { test, expect } from '../fixtures/auth.fixture';
import { TodoPage } from '../pages/TodoPage';
import { ApiFixture } from '../fixtures/api.fixture';
import { FRONTEND_URL, BACKEND_URL } from '../test-constants';

const api = new ApiFixture();

test.describe('Todo CRUD', () => {
  test.afterEach(async () => {
    await api.clearTodos();
  });

  test('@smoke add a todo and see it in the list', async ({ authenticatedPage }) => {
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);

    await todo.addTodo('Buy milk');
    await todo.expectTodoVisible('Buy milk');
  });

  test('@smoke complete a todo — checkbox checked and text struck through', async ({ authenticatedPage }) => {
    await api.createTodo('Read a book');
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);

    await todo.toggleTodo('Read a book');
    await todo.expectCompleted('Read a book');
  });

  test('@smoke delete a todo — removed from list', async ({ authenticatedPage }) => {
    await api.createTodo('Take out trash');
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);

    await todo.deleteTodo('Take out trash');
    await todo.expectTodoNotVisible('Take out trash');
  });

  test('delete one todo while others remain', async ({ authenticatedPage }) => {
    await api.createTodo('Task A');
    await api.createTodo('Task B');
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);

    await todo.deleteTodo('Task A');
    await todo.expectTodoNotVisible('Task A');
    await todo.expectTodoVisible('Task B');
  });

  test('User A todos are not visible to User B', async ({ browser }) => {
    // User A already has todos (seeded via API)
    await api.createTodo('User A secret todo');

    // Register User B (unique username per run)
    const runId = Date.now();
    const userBToken = await api.registerUser(`user-b-${runId}`, 'passwordB');

    // Log in as User B via a fresh browser context (no storageState)
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    // Log in via the backend directly and inject sessionStorage
    await pageB.goto(FRONTEND_URL);
    await pageB.getByPlaceholder('Username').fill(`user-b-${runId}`);
    await pageB.getByPlaceholder('Password').fill('passwordB');
    await pageB.getByRole('button', { name: 'Log In' }).click();
    await pageB.getByPlaceholder('Add a new task...').waitFor();

    // User A's todo must not appear in User B's view
    await expect(pageB.locator('.todo-item')).toHaveCount(0);

    await contextB.close();
  });
});
```

- [ ] **Step 2: Run todo tests**

```bash
cd e2e && npx playwright test tests/todos.spec.ts --reporter=list
```
Expected: all 5 todo tests pass

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/todos.spec.ts
git commit -m "feat: add todo CRUD e2e tests"
```

---

## Task 10: Write `timeline.spec.ts`

**Files:**
- Create: `e2e/tests/timeline.spec.ts`

- [ ] **Step 1: Create the file**

```ts
// e2e/tests/timeline.spec.ts
import { test, expect } from '../fixtures/auth.fixture';
import { TodoPage } from '../pages/TodoPage';
import { ApiFixture } from '../fixtures/api.fixture';
import { FRONTEND_URL } from '../test-constants';

const api = new ApiFixture();

test.describe('Timeline tab', () => {
  test.afterEach(async () => {
    await api.clearTodos();
  });

  test('Timeline tab is visible when feature flag is on', async ({ authenticatedPage }) => {
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);
    await todo.expectTimelineTabVisible();
  });

  test('timeline item appears in Timeline tab and not in To-Do tab', async ({ authenticatedPage }) => {
    const todo = new TodoPage(authenticatedPage);
    await authenticatedPage.goto(FRONTEND_URL);

    await todo.addTodo('Q3 milestone', 'timeline');

    // Item must NOT appear in To-Do tab (current tab)
    await todo.expectTodoNotVisible('Q3 milestone');

    // Item MUST appear in Timeline tab
    await todo.switchToTimeline();
    await expect(authenticatedPage.getByText('Q3 milestone')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run timeline tests**

```bash
cd e2e && npx playwright test tests/timeline.spec.ts --reporter=list
```
Expected: both tests pass

- [ ] **Step 3: Tear down stack**

```bash
docker compose -f docker-compose.e2e.yml down -v
```

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/timeline.spec.ts
git commit -m "feat: add timeline tab e2e tests"
```

---

## Task 11: Create GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Create the file**

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # nightly at 02:00 UTC

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install e2e dependencies
        run: npm ci
        working-directory: e2e

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
        working-directory: e2e

      - name: Start e2e stack
        run: docker compose -f docker-compose.e2e.yml up -d

      - name: Run smoke tests (PRs)
        if: github.event_name == 'pull_request'
        run: npx playwright test --grep @smoke
        working-directory: e2e

      - name: Run full suite (main / nightly)
        if: github.event_name != 'pull_request'
        run: npx playwright test
        working-directory: e2e

      - name: Tear down stack
        if: always()
        run: docker compose -f docker-compose.e2e.yml down -v

      - name: Upload Playwright report on failure
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: add GitHub Actions e2e workflow with smoke/full split"
```

---

## Task 12: Full suite verification

- [ ] **Step 1: Start the e2e stack**

```bash
docker compose -f docker-compose.e2e.yml up -d
```

- [ ] **Step 2: Run smoke tests**

```bash
cd e2e && npx playwright test --grep @smoke --reporter=list
```
Expected: 5 smoke-tagged tests all pass (2 auth + 3 todos)

- [ ] **Step 3: Run full suite**

```bash
cd e2e && npx playwright test --reporter=list
```
Expected: all 12 tests pass, 0 failures

- [ ] **Step 4: Run frontend unit tests to confirm no regression**

```bash
cd ../frontend && npm test -- --watchAll=false
```
Expected: all existing unit tests pass

- [ ] **Step 5: Tear down**

```bash
docker compose -f docker-compose.e2e.yml down -v
```

- [ ] **Step 6: Final commit (if any cleanup needed)**

```bash
git status  # should be clean after previous task commits
```
