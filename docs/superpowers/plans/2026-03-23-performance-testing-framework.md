# Performance Testing Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a k6-based performance testing framework inside `/performance/` that provides CI regression gates (smoke test) and on-demand capacity profiling (load, stress, soak, spike scenarios).

**Architecture:** Shared libraries (`lib/`) handle auth, HTTP client, and data generation. Scenario scripts (`scenarios/`) import from `lib/` and embed CI/local thresholds via `__ENV.CI`. A dedicated `docker-compose.perf.yml` spins up an isolated `postgres_perf` + `backend_perf` stack. GitHub Actions runs smoke on every PR to main.

**Tech Stack:** k6 v0.54.0, grafana/k6:0.54.0 Docker image, Docker Compose, GitHub Actions, FastAPI backend (JWT auth, PostgreSQL)

---

## Pre-flight: Key constraints to know

- **k6 init stage prohibits HTTP** — all network calls must be inside `default()` or `teardown()`
- **`/auth/login` uses form encoding** (`application/x-www-form-urlencoded`), not JSON — FastAPI's `OAuth2PasswordRequestForm`
- **`/auth/register` returns 409** when username already exists — `lib/auth.js` must handle this for repeated local runs
- **`ACCESS_TOKEN_EXPIRE_MINUTES=30`** by default — override to `120` in `docker-compose.perf.yml` so soak test tokens don't expire mid-run
- **k6 built-ins:** `__VU` = VU ID (1-indexed), `__ITER` = iteration counter per VU (0-indexed)
- **Auth pattern:** module-level `let token = null` guard — if null on entry to `default()`, register + login, store in module var

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `performance/lib/auth.js` | Create | registerAndLogin with 409 handling; returns JWT token |
| `performance/lib/client.js` | Create | HTTP wrapper with Authorization header pre-set |
| `performance/lib/data.js` | Create | Deterministic todo payload generator |
| `performance/scenarios/smoke.js` | Create | 1 VU, 30s, all endpoints, checks + thresholds |
| `performance/scenarios/load.js` | Create | Ramp 1→50→0 VUs, 5min |
| `performance/scenarios/stress.js` | Create | Ramp 1→200→0 VUs, 10min |
| `performance/scenarios/soak.js` | Create | 20 VUs steady, 30min |
| `performance/scenarios/spike.js` | Create | 0→500→0 VUs, 2min |
| `performance/docker-compose.perf.yml` | Create | Dedicated perf stack: postgres_perf + backend_perf + k6 |
| `performance/run.sh` | Create | Local runner: ./run.sh <scenario> [BASE_URL] |
| `performance/README.md` | Create | Usage docs, resource warnings, volume pruning instructions |
| `.github/workflows/perf.yml` | Create | CI: smoke on PR to main + push to main |
| `performance/reports/.gitkeep` | Create | Ensure reports dir exists but contents are gitignored |
| `performance/.gitignore` | Create | Ignore reports/*.json and reports/*.html |

---

## Task 1: Scaffold directory and git setup

**Files:**
- Create: `performance/.gitignore`
- Create: `performance/reports/.gitkeep`
- Create: `performance/lib/.gitkeep` (placeholder, removed when real files added)
- Create: `performance/scenarios/.gitkeep` (placeholder, removed when real files added)

- [ ] **Step 1: Create worktree for this branch**

```bash
git worktree add ../todo-app-perf feature/performance-framework
cd ../todo-app-perf
```

If branch doesn't exist yet:
```bash
git worktree add -b feature/performance-framework ../todo-app-perf main
cd ../todo-app-perf
```

- [ ] **Step 2: Create the directory structure**

```bash
mkdir -p performance/lib performance/scenarios performance/reports
```

- [ ] **Step 3: Create `.gitignore` for reports**

Create `performance/.gitignore`:
```
reports/*.json
reports/*.html
reports/*.csv
```

- [ ] **Step 4: Create `.gitkeep` for reports dir**

```bash
touch performance/reports/.gitkeep
```

- [ ] **Step 5: Commit scaffold**

```bash
git add performance/
git commit -m "feat: scaffold performance testing directory structure"
```

---

## Task 2: `lib/auth.js` — per-VU authentication

**Files:**
- Create: `performance/lib/auth.js`

**Behavior:**
- Module-level `let token = null` guard — first call to `getToken()` performs register + login, subsequent calls return cached token
- `POST /auth/register` — JSON body, handles 409 by skipping to login
- `POST /auth/login` — form-encoded body (`application/x-www-form-urlencoded`)
- Username pattern: `user_perf_${__VU}` — unique per VU, stable across iterations

- [ ] **Step 1: Create `performance/lib/auth.js`**

```javascript
import http from 'k6/http';
import { check } from 'k6';

// Module-level token cache — one per VU (each VU has its own module scope)
let token = null;

const PASSWORD = 'PerfTest123!';

export function getToken(baseUrl) {
  if (token !== null) {
    return token;
  }

  const username = `user_perf_${__VU}`;

  // Register — 409 means user already exists from a prior run, that's fine
  const registerRes = http.post(
    `${baseUrl}/auth/register`,
    JSON.stringify({ username, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(registerRes, {
    'register: 201 or 409': (r) => r.status === 201 || r.status === 409,
  });

  // Login — always required (even after 409 on register)
  // NOTE: /auth/login requires application/x-www-form-urlencoded (FastAPI OAuth2PasswordRequestForm)
  const loginRes = http.post(
    `${baseUrl}/auth/login`,
    `username=${encodeURIComponent(username)}&password=${encodeURIComponent(PASSWORD)}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  check(loginRes, {
    'login: status 200': (r) => r.status === 200,
    'login: has access_token': (r) => r.json('access_token') !== undefined,
  });

  token = loginRes.json('access_token');
  return token;
}
```

- [ ] **Step 2: Verify the file looks correct (dry read)**

```bash
cat performance/lib/auth.js
```

Expected: file content matches above, no syntax errors visible.

- [ ] **Step 3: Commit**

```bash
git add performance/lib/auth.js
git commit -m "feat: add lib/auth.js with per-VU register/login and 409 handling"
```

---

## Task 3: `lib/client.js` — HTTP wrapper

**Files:**
- Create: `performance/lib/client.js`

**Behavior:**
- Returns a `client` object with `get`, `post`, `put`, `delete` methods
- Pre-sets `Authorization: Bearer <token>` and `Content-Type: application/json` on all requests
- All methods return the raw k6 response for the caller to check

- [ ] **Step 1: Create `performance/lib/client.js`**

```javascript
import http from 'k6/http';

export function makeClient(baseUrl, token) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  return {
    get: (path) =>
      http.get(`${baseUrl}${path}`, { headers }),

    post: (path, body) =>
      http.post(`${baseUrl}${path}`, JSON.stringify(body), { headers }),

    put: (path, body) =>
      http.put(`${baseUrl}${path}`, JSON.stringify(body), { headers }),

    del: (path) =>
      http.del(`${baseUrl}${path}`, null, { headers }),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add performance/lib/client.js
git commit -m "feat: add lib/client.js HTTP wrapper with auth header"
```

---

## Task 4: `lib/data.js` — payload generators

**Files:**
- Create: `performance/lib/data.js`

**Behavior:**
- `todoPayload(vuId, iter)` — returns a unique todo create payload using VU ID + iteration counter
- Titles are unique across VUs and iterations to prevent DB unique constraint issues

- [ ] **Step 1: Create `performance/lib/data.js`**

```javascript
export function todoPayload() {
  // __VU and __ITER are k6 built-ins: VU ID (1-indexed) and iteration (0-indexed)
  return {
    title: `perf-todo-vu${__VU}-iter${__ITER}`,
    type: 'todo',
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add performance/lib/data.js
git commit -m "feat: add lib/data.js deterministic todo payload generator"
```

---

## Task 5: `scenarios/smoke.js` — smoke test (CI scenario)

**Files:**
- Create: `performance/scenarios/smoke.js`

**Behavior:**
- 1 VU, 30 seconds
- Per-iteration: auth guard → GET /todos → POST /todos → PUT /todos/{id} → DELETE /todos/{id}
- Checks on every response (status code + body shape)
- Thresholds: CI strict (`p(95)<500`, `rate<0.01`, `rate>0.99`) vs local relaxed via `__ENV.CI`
- Uses `handleSummary` to write HTML report

- [ ] **Step 1: Create `performance/scenarios/smoke.js`**

```javascript
import { check } from 'k6';
import { htmlReport } from 'https://raw.githubusercontent.com/grafana/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { getToken } from '../lib/auth.js';
import { makeClient } from '../lib/client.js';
import { todoPayload } from '../lib/data.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const IS_CI = !!__ENV.CI;

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: [IS_CI ? 'p(95)<500' : 'p(95)<1000'],
    http_req_failed:   [IS_CI ? 'rate<0.01' : 'rate<0.05'],
    checks:            [IS_CI ? 'rate>0.99' : 'rate>0.95'],
  },
};

export default function () {
  const token = getToken(BASE_URL);
  const client = makeClient(BASE_URL, token);

  // GET /todos
  const listRes = client.get('/todos');
  check(listRes, {
    'GET /todos: status 200': (r) => r.status === 200,
    'GET /todos: returns array': (r) => Array.isArray(r.json()),
  });

  // POST /todos
  const payload = todoPayload();
  const createRes = client.post('/todos', payload);
  check(createRes, {
    'POST /todos: status 201': (r) => r.status === 201,
    'POST /todos: has id': (r) => r.json('id') !== undefined,
    'POST /todos: title matches': (r) => r.json('title') === payload.title,
    'POST /todos: completed is false': (r) => r.json('completed') === false,
  });

  const todoId = createRes.json('id');

  // PUT /todos/{id}
  const updateRes = client.put(`/todos/${todoId}`, { title: `${payload.title}-updated`, completed: true });
  check(updateRes, {
    'PUT /todos/{id}: status 200': (r) => r.status === 200,
    'PUT /todos/{id}: completed is true': (r) => r.json('completed') === true,
  });

  // DELETE /todos/{id}
  const deleteRes = client.del(`/todos/${todoId}`);
  check(deleteRes, {
    'DELETE /todos/{id}: status 204': (r) => r.status === 204,
  });
}

export function handleSummary(data) {
  return {
    'reports/smoke-summary.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add performance/scenarios/smoke.js
git commit -m "feat: add smoke scenario with checks and CI/local thresholds"
```

---

## Task 6: `docker-compose.perf.yml` — dedicated perf stack

**Files:**
- Create: `performance/docker-compose.perf.yml`

**Key points:**
- `postgres_perf`: isolated DB, healthcheck, port not exposed
- `backend_perf`: same image as dev, `ACCESS_TOKEN_EXPIRE_MINUTES=120` to support soak test
- `k6`: pinned to `grafana/k6:0.54.0`, mounts `./performance` as `/scripts` and `./performance/reports` as `/reports`
- `k6` default command runs smoke; overridden by `run.sh` and CI

- [ ] **Step 1: Create `performance/docker-compose.perf.yml`**

```yaml
services:
  postgres_perf:
    image: postgres:13
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=tododb_perf
    volumes:
      - postgres_perf_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d tododb_perf"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 30s

  backend_perf:
    build:
      context: ../backend
    ports:
      - "8001:8000"
    volumes:
      - ../backend:/app
    environment:
      - PYTHONUNBUFFERED=1
      - PYTHONPATH=/app
      - DATABASE_URL=postgresql+asyncpg://user:password@postgres_perf/tododb_perf
      - SECRET_KEY=perf-test-secret-key-not-for-production
      - ACCESS_TOKEN_EXPIRE_MINUTES=120
    depends_on:
      postgres_perf:
        condition: service_healthy
    restart: unless-stopped

  k6:
    image: grafana/k6:0.54.0
    volumes:
      - ./:/scripts
      - ./reports:/reports
    environment:
      - BASE_URL=http://backend_perf:8000
    command: run /scripts/scenarios/smoke.js --out json=/reports/result.json
    depends_on:
      - backend_perf
    networks:
      - default

volumes:
  postgres_perf_data:
```

> Note: `build: context: ../backend` because this file lives inside `performance/`, not the repo root.

- [ ] **Step 2: Verify the backend port does not conflict with dev stack**

```bash
# Dev stack uses port 8000; perf stack uses 8001 to allow both running simultaneously
grep "ports" performance/docker-compose.perf.yml
```

Expected: `- "8001:8000"`

- [ ] **Step 3: Commit**

```bash
git add performance/docker-compose.perf.yml
git commit -m "feat: add docker-compose.perf.yml with isolated postgres_perf stack"
```

---

## Task 7: `run.sh` — local runner

**Files:**
- Create: `performance/run.sh`

**Behavior:**
- Usage: `./run.sh <scenario> [BASE_URL]`
- If BASE_URL provided, runs k6 directly against that URL (no Docker Compose)
- If no BASE_URL, starts Docker Compose perf stack and runs k6 inside it
- Propagates k6 exit code without modification

- [ ] **Step 1: Create `performance/run.sh`**

```bash
#!/usr/bin/env bash
set -e

SCENARIO=${1:-smoke}
BASE_URL=${2:-""}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$BASE_URL" ]; then
  # Run against local Docker Compose perf stack
  echo "Starting perf stack and running scenario: $SCENARIO"
  docker compose -f "$SCRIPT_DIR/docker-compose.perf.yml" up -d postgres_perf backend_perf
  docker compose -f "$SCRIPT_DIR/docker-compose.perf.yml" run --rm \
    -e BASE_URL=http://backend_perf:8000 \
    k6 run "/scripts/scenarios/${SCENARIO}.js" --out "json=/reports/${SCENARIO}-result.json"
  EXIT_CODE=$?
  docker compose -f "$SCRIPT_DIR/docker-compose.perf.yml" stop backend_perf
  exit $EXIT_CODE
else
  # Run k6 directly against provided BASE_URL (staging, prod, etc.)
  echo "Running scenario: $SCENARIO against $BASE_URL"
  docker run --rm \
    -v "$SCRIPT_DIR:/scripts" \
    -v "$SCRIPT_DIR/reports:/reports" \
    -e "BASE_URL=$BASE_URL" \
    grafana/k6:0.54.0 run "/scripts/scenarios/${SCENARIO}.js" --out "json=/reports/${SCENARIO}-result.json"
fi
```

- [ ] **Step 2: Make executable**

```bash
chmod +x performance/run.sh
```

- [ ] **Step 3: Commit**

```bash
git add performance/run.sh
git commit -m "feat: add run.sh local runner with Docker Compose and remote target support"
```

---

## Task 8: Remaining scenarios — load, stress, soak, spike

**Files:**
- Create: `performance/scenarios/load.js`
- Create: `performance/scenarios/stress.js`
- Create: `performance/scenarios/soak.js`
- Create: `performance/scenarios/spike.js`

All four share the same `default()` function as smoke. Only `options` differs.

- [ ] **Step 1: Create `performance/scenarios/load.js`**

```javascript
import { check } from 'k6';
import { getToken } from '../lib/auth.js';
import { makeClient } from '../lib/client.js';
import { todoPayload } from '../lib/data.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const IS_CI = !!__ENV.CI;

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: [IS_CI ? 'p(95)<500' : 'p(95)<1000'],
    http_req_failed:   [IS_CI ? 'rate<0.01' : 'rate<0.05'],
    checks:            [IS_CI ? 'rate>0.99' : 'rate>0.95'],
  },
};

export default function () {
  const token = getToken(BASE_URL);
  const client = makeClient(BASE_URL, token);
  const payload = todoPayload();

  const listRes = client.get('/todos');
  check(listRes, { 'GET /todos: 200': (r) => r.status === 200 });

  const createRes = client.post('/todos', payload);
  check(createRes, {
    'POST /todos: 201': (r) => r.status === 201,
    'POST /todos: has id': (r) => r.json('id') !== undefined,
  });

  const todoId = createRes.json('id');

  const updateRes = client.put(`/todos/${todoId}`, { completed: true });
  check(updateRes, { 'PUT /todos/{id}: 200': (r) => r.status === 200 });

  const deleteRes = client.del(`/todos/${todoId}`);
  check(deleteRes, { 'DELETE /todos/{id}: 204': (r) => r.status === 204 });
}
```

- [ ] **Step 2: Create `performance/scenarios/stress.js`**

```javascript
import { check } from 'k6';
import { getToken } from '../lib/auth.js';
import { makeClient } from '../lib/client.js';
import { todoPayload } from '../lib/data.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const IS_CI = !!__ENV.CI;

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '3m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: [IS_CI ? 'p(95)<500' : 'p(95)<2000'],
    http_req_failed:   ['rate<0.10'],
    checks:            ['rate>0.90'],
  },
};

export default function () {
  const token = getToken(BASE_URL);
  const client = makeClient(BASE_URL, token);
  const payload = todoPayload();

  const listRes = client.get('/todos');
  check(listRes, { 'GET /todos: 200': (r) => r.status === 200 });

  const createRes = client.post('/todos', payload);
  check(createRes, {
    'POST /todos: 201': (r) => r.status === 201,
    'POST /todos: has id': (r) => r.json('id') !== undefined,
  });

  if (createRes.status === 201) {
    const todoId = createRes.json('id');
    const updateRes = client.put(`/todos/${todoId}`, { completed: true });
    check(updateRes, { 'PUT /todos/{id}: 200': (r) => r.status === 200 });
    const deleteRes = client.del(`/todos/${todoId}`);
    check(deleteRes, { 'DELETE /todos/{id}: 204': (r) => r.status === 204 });
  }
}
```

- [ ] **Step 3: Create `performance/scenarios/soak.js`**

```javascript
import { check } from 'k6';
import { getToken } from '../lib/auth.js';
import { makeClient } from '../lib/client.js';
import { todoPayload } from '../lib/data.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// NOTE: Requires ACCESS_TOKEN_EXPIRE_MINUTES >= 120 in the target environment.
// docker-compose.perf.yml sets this to 120. For external targets, verify before running.
export const options = {
  vus: 20,
  duration: '30m',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed:   ['rate<0.01'],
    checks:            ['rate>0.99'],
  },
};

export default function () {
  const token = getToken(BASE_URL);
  const client = makeClient(BASE_URL, token);
  const payload = todoPayload();

  const listRes = client.get('/todos');
  check(listRes, { 'GET /todos: 200': (r) => r.status === 200 });

  const createRes = client.post('/todos', payload);
  check(createRes, {
    'POST /todos: 201': (r) => r.status === 201,
    'POST /todos: has id': (r) => r.json('id') !== undefined,
  });

  if (createRes.status === 201) {
    const todoId = createRes.json('id');
    const deleteRes = client.del(`/todos/${todoId}`);
    check(deleteRes, { 'DELETE /todos/{id}: 204': (r) => r.status === 204 });
  }
}
```

- [ ] **Step 4: Create `performance/scenarios/spike.js`**

```javascript
import { check } from 'k6';
import { getToken } from '../lib/auth.js';
import { makeClient } from '../lib/client.js';
import { todoPayload } from '../lib/data.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// WARNING: This scenario targets 500 VUs. Do NOT run on a developer laptop.
// Use a server or CI environment with at least 8GB RAM and 4 CPUs.
export const options = {
  stages: [
    { duration: '10s', target: 0 },
    { duration: '20s', target: 500 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.20'],
    checks:          ['rate>0.80'],
  },
};

export default function () {
  const token = getToken(BASE_URL);
  const client = makeClient(BASE_URL, token);
  const payload = todoPayload();

  const listRes = client.get('/todos');
  check(listRes, { 'GET /todos: 200 or 503': (r) => r.status === 200 || r.status === 503 });

  const createRes = client.post('/todos', payload);
  check(createRes, { 'POST /todos: 201 or 5xx': (r) => r.status === 201 || r.status >= 500 });

  if (createRes.status === 201) {
    const todoId = createRes.json('id');
    client.del(`/todos/${todoId}`);
  }
}
```

- [ ] **Step 5: Commit all scenarios**

```bash
git add performance/scenarios/
git commit -m "feat: add load, stress, soak, spike scenarios"
```

---

## Task 9: GitHub Actions `perf.yml`

**Files:**
- Create: `.github/workflows/perf.yml`

- [ ] **Step 1: Create `.github/workflows/perf.yml`**

```yaml
name: Performance Tests

on:
  pull_request:
    branches:
      - main
  push:
    branches:
      - main

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - name: Check out code
        uses: actions/checkout@v4

      - name: Start perf stack
        run: docker compose -f performance/docker-compose.perf.yml up -d postgres_perf backend_perf

      - name: Wait for backend to be ready
        run: |
          echo "Waiting for backend_perf..."
          for i in $(seq 1 30); do
            if docker compose -f performance/docker-compose.perf.yml exec -T backend_perf curl -sf http://localhost:8000/ > /dev/null 2>&1; then
              echo "Backend ready"
              break
            fi
            echo "Attempt $i/30..."
            sleep 2
          done

      - name: Run smoke test
        run: |
          docker compose -f performance/docker-compose.perf.yml run --rm \
            -e CI=true \
            -e BASE_URL=http://backend_perf:8000 \
            k6 run /scripts/scenarios/smoke.js \
            --out json=/reports/smoke-result.json

      - name: Upload smoke report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: perf-smoke-report-${{ github.run_number }}
          path: performance/reports/
          retention-days: 30

      - name: Tear down perf stack
        if: always()
        run: docker compose -f performance/docker-compose.perf.yml down
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/perf.yml
git commit -m "feat: add GitHub Actions smoke test workflow"
```

---

## Task 10: README

**Files:**
- Create: `performance/README.md`

- [ ] **Step 1: Create `performance/README.md`**

```markdown
# Performance Testing

k6-based performance testing framework for the Todo API.

## Quick Start

```bash
# Run smoke test against local Docker perf stack
./performance/run.sh smoke

# Run load test against local Docker perf stack
./performance/run.sh load

# Run against a deployed environment
./performance/run.sh smoke https://staging.example.com
./performance/run.sh load https://staging.example.com
```

## Scenarios

| Scenario | VUs | Duration | Purpose |
|----------|-----|----------|---------|
| `smoke`  | 1   | 30s      | Sanity check — runs in CI on every PR |
| `load`   | 1→50→0 | 5min | Baseline normal traffic |
| `stress` | 1→200→0 | 10min | Find degradation point |
| `soak`   | 20 steady | 30min | Memory leaks, connection exhaustion |
| `spike`  | 0→500→0 | 2min | Resilience under sudden burst |

## ⚠️ Resource Warnings

**`stress` and `spike` scenarios require significant resources.**
Do NOT run them on a developer laptop. Use a server or CI environment with at least 8GB RAM and 4 CPUs.

**`soak` requires `ACCESS_TOKEN_EXPIRE_MINUTES >= 120`** in the target environment.
The local perf stack (`docker-compose.perf.yml`) sets this automatically. For external targets, verify before running.

## Local Stack Management

```bash
# Start perf stack manually (leaves it running for multiple test runs)
docker compose -f performance/docker-compose.perf.yml up -d postgres_perf backend_perf

# Tear down and remove volumes (cleans up test users/data)
docker compose -f performance/docker-compose.perf.yml down -v
```

Pruning the volume resets the database. On the next run, test users (`user_perf_*`) will be re-created fresh.
If you don't prune, repeated runs reuse existing test users (the auth library handles 409 automatically).

## Reports

Reports are written to `performance/reports/` (gitignored).
- `*.json` — raw k6 metrics (machine-readable)
- `*.html` — human-readable summary (smoke scenario only)

## CI

The smoke test runs automatically on every PR to `main` and on push to `main`.
A threshold breach fails the build. Artifacts are retained for 30 days.

## Threshold Reference

| Metric | CI (strict) | Local (relaxed) |
|--------|------------|-----------------|
| `http_req_duration p(95)` | < 500ms | < 1000ms |
| `http_req_failed rate` | < 1% | < 5% |
| `checks pass rate` | > 99% | > 95% |

Set `CI=true` env var to use strict thresholds: `./run.sh smoke --env CI=true`
```

- [ ] **Step 2: Commit**

```bash
git add performance/README.md
git commit -m "docs: add performance testing README with usage, warnings, and CI reference"
```

---

## Task 11: End-to-end smoke run verification

Verify everything works together before declaring done.

- [ ] **Step 1: Start the perf stack**

```bash
docker compose -f performance/docker-compose.perf.yml up -d postgres_perf backend_perf
```

Expected: both containers start, backend_perf reaches healthy state.

- [ ] **Step 2: Run smoke test locally**

```bash
./performance/run.sh smoke
```

Expected output includes:
- `register: 201 or 409 ✓`
- `login: status 200 ✓`
- `GET /todos: status 200 ✓`
- `POST /todos: status 201 ✓`
- `PUT /todos/{id}: status 200 ✓`
- `DELETE /todos/{id}: status 204 ✓`
- All thresholds: `✓`
- Exit code 0

- [ ] **Step 3: Verify report file created**

```bash
ls performance/reports/
```

Expected: `smoke-result.json` exists.

- [ ] **Step 4: Tear down**

```bash
docker compose -f performance/docker-compose.perf.yml down
```

- [ ] **Step 5: Final commit if any fixups were needed**

```bash
git add -p  # stage only actual fixes
git commit -m "fix: smoke run verification fixups"
```

- [ ] **Step 6: Push branch**

```bash
git push -u origin feature/performance-framework
```
