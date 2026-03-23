# E2E Testing Framework Design

**Date:** 2026-03-23
**Project:** todo-app
**Status:** Approved

---

## Overview

Add an end-to-end testing framework to the existing todo-app monorepo using Playwright with TypeScript. Tests live in a top-level `/e2e` directory, run against a dedicated isolated Docker Compose stack, and execute both locally and in CI.

---

## Technology Choices

| Decision | Choice | Rationale |
|---|---|---|
| Tool | Playwright (TypeScript) | First-class TS support, `@playwright/test` runner, strong CI integration, largest e2e community |
| Language | TypeScript | Consistent with frontend, can share types, native browser ecosystem |
| Location | `/e2e` in existing repo | App and tests change together; prevents drift; simpler CI wiring |
| Structure | Page Object Model | Maintainable at scale; selectors in one place; tests read as user stories |
| App environment | `docker-compose.e2e.yml` | Isolated PostgreSQL; reproducible in CI; dev environment untouched |
| Minimum Playwright version | 1.30+ | Required for regex support in `toHaveCSS` assertions |

---

## Directory Structure

```
todo-app/
├── backend/
├── frontend/
├── e2e/
│   ├── pages/
│   │   ├── AuthPage.ts           ← login/register form interactions
│   │   └── TodoPage.ts           ← todo list, form, timeline tab
│   ├── fixtures/
│   │   ├── auth.fixture.ts       ← test fixture that loads saved storageState per-test
│   │   └── api.fixture.ts        ← direct HTTP calls for data seeding and cleanup
│   ├── tests/
│   │   ├── auth.spec.ts          ← register, login, logout, 401 redirect
│   │   ├── todos.spec.ts         ← add, complete, delete, user isolation
│   │   └── timeline.spec.ts      ← timeline tab visible with feature flag on
│   ├── global-setup.ts           ← runs once before suite: health checks + saves storageState
│   ├── playwright.config.ts
│   └── package.json
├── docker-compose.yml            ← existing dev stack (unchanged)
└── docker-compose.e2e.yml        ← new: isolated test stack
```

---

## Configuration

### `playwright.config.ts`

- `baseURL`: `http://localhost:3000`
- `storageState`: loaded per-test via `auth.fixture.ts` (path: `path.join(__dirname, '.auth/user.json')`)
- Browser projects: `chromium` always (locally and CI); `firefox` excluded — one-browser CI is standard for a project this size and avoids the complexity of maintaining two browser installs
- `globalSetup`: `'./global-setup.ts'` — polls health endpoints before any test runs
- `testDir`: `'./tests'` — isolated from `frontend/src` so `react-scripts test` never picks up e2e specs
- `retries`: 1 in CI, 0 locally

### `global-setup.ts`

Runs once before the entire suite. Two responsibilities:

1. **Health check**: polls `GET http://localhost:8000/` (backend) and `GET http://localhost:3000` (frontend) every 2 seconds, up to 60 seconds total. Throws a descriptive error if either service does not respond in time.
2. **Auth state**: calls `POST http://localhost:8000/auth/register` then `POST http://localhost:8000/auth/login` to create a known test user, then uses Playwright's `chromium.launch()` to save `storageState` to `e2e/.auth/user.json`. This file is loaded per-test by `auth.fixture.ts`.

**Important — login encoding:** The backend's `/auth/login` endpoint uses FastAPI's `OAuth2PasswordRequestForm`, which requires `Content-Type: application/x-www-form-urlencoded`, not JSON. Both `global-setup.ts` and `api.fixture.ts` must send login requests using `URLSearchParams`:

```ts
fetch('http://localhost:8000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ username, password }),
})
```

Sending a JSON body to this endpoint returns `422 Unprocessable Entity`.

The saved test user credentials (e.g. `e2e-user` / `e2e-password`) are defined as constants in `global-setup.ts` and exported so `api.fixture.ts` can reuse them to obtain a token for API seeding.

### `auth.fixture.ts`

A `test.extend`-based Playwright fixture (not `globalSetup`). Provides an `authenticatedPage` fixture that loads `storageState` from `e2e/.auth/user.json` before each test:

```ts
export const test = base.extend({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(__dirname, '../.auth/user.json'),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});
```

Tests that require auth import `test` from `auth.fixture.ts`. Tests for the login/register UI import the base `test` from `@playwright/test` directly.

### `api.fixture.ts`

Direct HTTP calls to the backend API using Node's `fetch`. Obtains a token by calling `POST /auth/login` with the same test user credentials exported from `global-setup.ts`. Provides:

```ts
class ApiFixture {
  // token is obtained internally via login at fixture construction time
  async createTodo(title: string, type: 'todo' | 'timeline' = 'todo'): Promise<Todo>
  async clearTodos(): Promise<void>
}
```

`clearTodos` is called in `afterEach` hooks so each test starts with a clean state. There is no bulk-delete endpoint on the backend; `clearTodos` must call `GET /todos` to retrieve all IDs, then call `DELETE /todos/{id}` for each one sequentially.

**Important — login encoding:** Same constraint as `global-setup.ts` — use `URLSearchParams` body for `/auth/login`.

### `docker-compose.e2e.yml`

Mirrors `docker-compose.yml` with:
- Separate named volume `postgres_e2e_data` — never shares state with dev DB
- Backend `DATABASE_URL` points at the e2e database
- Frontend served with `REACT_APP_TIMELINE_FEATURE_FLAG=true`
- All services on the same ports (`3000`, `8000`)

---

## Page Objects

### `AuthPage.ts`

Wraps the login/register UI. Selectors based on existing `AuthForm.tsx` — no `data-testid` required:

```ts
class AuthPage {
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
}
```

### `TodoPage.ts`

Wraps the main app. Key pattern: scope to the `.todo-item` container filtered by text to disambiguate repeated Delete buttons.

**DOM structure note:** `TodoItem.tsx` renders:
```html
<div>                                       ← outer wrapper, no class
  <div class="todo-item task-content">      ← two classes on same element
    <div style="text-decoration: ...">      ← styled div (line-through when completed)
      <input type="checkbox" />
      <span class="task-text">title</span>
    </div>
    <button class="delete-btn delete">Delete</button>
  </div>
</div>
```

`todoRow` anchors to `.todo-item` (the inner div with classes). The Delete button and checkbox are both children of this element, so scoping works correctly. The `expectCompleted` assertion targets `.todo-item > div:first-child` to reach the styled div directly:

```ts
class TodoPage {
  async addTodo(text: string, type: 'todo' | 'timeline' = 'todo') {
    await this.page.getByPlaceholder('Add a new task...').fill(text);
    // The type select is always rendered regardless of feature flag;
    // default value is 'todo' so only change it when creating a timeline item
    if (type === 'timeline') {
      await this.page.getByRole('combobox').selectOption('timeline');
    }
    await this.page.getByRole('button', { name: 'Add' }).click();
  }

  private todoRow(text: string) {
    return this.page.locator('.todo-item').filter({ hasText: text });
  }

  async toggleTodo(text: string) {
    await this.todoRow(text).getByRole('checkbox').click();
  }

  async deleteTodo(text: string) {
    await this.todoRow(text).getByRole('button', { name: 'Delete' }).click();
  }

  async expectCompleted(text: string) {
    // targets the first child div of .todo-item which carries the inline line-through style
    await expect(
      this.todoRow(text).locator('> div:first-child')
    ).toHaveCSS('text-decoration', /line-through/);
  }

  async switchToTimeline() {
    await this.page.getByRole('tab', { name: 'Timeline' }).click();
  }

  async logout() {
    await this.page.getByRole('button', { name: 'Logout' }).click();
  }
}
```

**Edge case:** two todos with identical text. Handled by using unique text in test data (e.g. `uuid`-suffixed titles), not by requiring `data-testid`.

---

## Selector Strategy

Selectors use a priority tier — no blanket requirement for `data-testid`:

| Tier | Strategy | When to use |
|---|---|---|
| 1 | `getByRole`, `getByLabel`, `getByPlaceholder` | Standard HTML elements — most cases |
| 2 | `getByText` | Stable visible text |
| 3 | `.locator('.css-class').filter({ hasText })` | Repeated components (todo rows) |
| 4 | `locator('css-selector')` | No semantic hook available |
| 5 | `data-testid` | Genuinely ambiguous elements only — negotiated selectively |

CSS classes already in the codebase (`auth-error`, `auth-switch-btn`, `todo-item`, `task-text`, `delete-btn`, `logout-btn`) are used as fallbacks where semantic locators are insufficient.

---

## Test Scenarios

### `auth.spec.ts`
- Register a new user → lands on todo list
- Login with valid credentials → lands on todo list
- Login with wrong password → shows error message
- Logout → returns to login screen
- Accessing app after token expiry → redirected to login (401 handling)

### `todos.spec.ts`
- Add a todo → appears in list
- Complete a todo → checkbox checked, text struck through
- Delete a todo → removed from list
- Add multiple todos → all appear; delete one → others remain
- User A's todos not visible to User B (isolation)

### `timeline.spec.ts`
- Timeline tab is visible when `REACT_APP_TIMELINE_FEATURE_FLAG=true` (the e2e stack always has this set)
- Add a timeline item via the type select → item appears in Timeline tab, not in To-Do tab

**Prerequisite bug fix:** `App.tsx` currently calls `api.addTodo(text, token)` — it does not pass the `type` argument that `TodoForm` provides. This means the type select in the UI has no effect; items are always created as `type: "todo"`. The "add timeline item" scenario cannot pass until `App.tsx` is updated to forward the `type` argument to `api.addTodo`. This is a pre-existing application bug that must be fixed as part of the e2e implementation work. Similarly, `api.ts`'s `addTodo` does not include `type` in the request body and needs updating.

**Note:** the "flag off" scenario (Timeline tab hidden) is out of scope for this framework. The `docker-compose.e2e.yml` always sets the flag to `true`, matching the dev compose. Testing the flag-off state would require a second compose profile and is deferred.

---

## CI Integration

### GitHub Actions workflow (`.github/workflows/e2e.yml`)

```yaml
on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'   # nightly at 02:00 UTC

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
        working-directory: e2e
      - run: npx playwright install --with-deps chromium
        working-directory: e2e
      - run: docker compose -f docker-compose.e2e.yml up -d
      - name: Run smoke tests (PRs)
        if: github.event_name == 'pull_request'
        run: npx playwright test --grep @smoke
        working-directory: e2e
      - name: Run full suite (main / nightly)
        if: github.event_name != 'pull_request'
        run: npx playwright test
        working-directory: e2e
      - run: docker compose -f docker-compose.e2e.yml down -v
        if: always()
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
```

**Health check:** `global-setup.ts` polls backend and frontend readiness before any test runs (see Configuration section). No explicit `sleep` step required in CI.

**Two test subsets:**
- PRs: `--grep @smoke` — auth + basic todo CRUD (fast feedback)
- Push to `main` + nightly: full suite including timeline and user isolation tests

Tests that belong to the smoke subset are tagged `@smoke` in their title:
```ts
test('@smoke add a todo and see it in the list', async ...)
```

---

## Running Locally

```bash
# start isolated stack
docker compose -f docker-compose.e2e.yml up -d

# install and run all tests
cd e2e && npm ci && npx playwright test

# run smoke tests only
npx playwright test --grep @smoke

# headed mode for debugging
npx playwright test --headed

# teardown
docker compose -f docker-compose.e2e.yml down -v
```

---

## Out of Scope

- Visual regression testing (screenshot diffing)
- Performance/load testing
- Mobile viewport testing
- Multi-browser testing (Firefox, Safari) — single-browser (Chromium) CI is standard for this project size
- Feature flag "off" state testing — deferred; requires a separate compose profile
- API-only tests — covered by existing pytest suite in `backend/tests/`
