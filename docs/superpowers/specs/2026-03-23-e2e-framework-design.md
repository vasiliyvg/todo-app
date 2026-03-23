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
│   │   ├── auth.fixture.ts       ← storageState: saves logged-in session once, reuses across tests
│   │   └── api.fixture.ts        ← direct HTTP calls for data seeding and cleanup
│   ├── tests/
│   │   ├── auth.spec.ts          ← register, login, logout, 401 redirect
│   │   ├── todos.spec.ts         ← add, complete, delete, user isolation
│   │   └── timeline.spec.ts      ← timeline tab, feature flag on/off
│   ├── playwright.config.ts
│   └── package.json
├── docker-compose.yml            ← existing dev stack (unchanged)
└── docker-compose.e2e.yml        ← new: isolated test stack
```

---

## Configuration

### `playwright.config.ts`

- `baseURL`: `http://localhost:3000`
- `storageState`: `e2e/.auth/user.json` — loaded by tests that require authentication
- Browser projects: `chromium` always; `firefox` in CI only
- `globalSetup`: waits for backend and frontend health checks before any test runs
- `testDir`: `./e2e/tests` — isolated from `frontend/src` so `react-scripts test` never picks up e2e specs
- `retries`: 1 in CI, 0 locally

### `docker-compose.e2e.yml`

Mirrors `docker-compose.yml` with:
- Separate named volume `postgres_e2e_data` — never shares state with dev DB
- Backend `DATABASE_URL` points at the e2e database
- Frontend served with `REACT_APP_TIMELINE_FEATURE_FLAG=true`
- All services on the same ports (`3000`, `8000`) so `playwright.config.ts` needs no environment-specific config

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

Wraps the main app. Key pattern: scope to `.todo-item` container filtered by text to disambiguate repeated Delete buttons — no `data-testid` required:

```ts
class TodoPage {
  async addTodo(text: string, type: 'todo' | 'timeline' = 'todo') {
    await this.page.getByPlaceholder('Add a new task...').fill(text);
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
    await expect(
      this.todoRow(text).locator('div').first()
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

**Edge case:** two todos with identical text. Handled by using unique text in test data (e.g. generated suffixes), not by requiring `data-testid`.

---

## Fixtures

### `auth.fixture.ts` — Session reuse

`globalSetup` calls `POST /auth/login` directly (no UI), saves the token to `e2e/.auth/user.json`. Tests that need auth load `storageState: 'e2e/.auth/user.json'` — browser starts already authenticated. No login traversal on every test.

### `api.fixture.ts` — Data seeding

Direct HTTP calls to the backend API for test setup and teardown:

```ts
class ApiFixture {
  async createTodo(token: string, title: string, type = 'todo'): Promise<Todo>
  async clearTodos(token: string): Promise<void>
  async registerUser(username: string, password: string): Promise<string> // returns token
}
```

Tests that verify delete/complete start with API-seeded data, not UI-created data. This isolates the interaction under test.

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
- Add a timeline item → appears in Timeline tab (not in To-Do tab)
- Timeline tab visible when feature flag is `true`
- Timeline tab hidden when feature flag is `false`

---

## CI Integration

### GitHub Actions workflow (`.github/workflows/e2e.yml`)

```yaml
on:
  pull_request:
  push:
    branches: [main]

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
      - run: npx playwright test
        working-directory: e2e
      - run: docker compose -f docker-compose.e2e.yml down -v
        if: always()
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
```

**Two test subsets:**
- `--grep @smoke` — fast subset (auth + basic todo CRUD) on every PR
- Full suite — on push to `main` and nightly scheduled run

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
- API-only tests (covered by existing pytest suite in `backend/tests/`)
