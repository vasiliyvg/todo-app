# Performance Testing Framework Design

**Date:** 2026-03-23
**Status:** Approved
**Tool:** k6
**Location:** `/performance/` inside this repository

---

## Goals

1. **Regression detection** — smoke test runs in CI on every PR to main; fails the build if thresholds are breached
2. **Capacity profiling** — load, stress, soak, and spike scenarios run on demand locally or against a deployed environment

---

## Directory Structure

```
performance/
  lib/
    auth.js          # per-VU user registration + login, returns token
    client.js        # base HTTP client with Authorization header pre-set
    data.js          # deterministic todo payload generators (vuId + iter)
  scenarios/
    smoke.js         # 1 VU, 30s — sanity check all endpoints
    load.js          # ramp 1→50→0 VUs, 5min — normal expected load
    stress.js        # ramp 1→200→0 VUs, 10min — find degradation point
    soak.js          # 20 VUs steady, 30min — memory leaks / connection exhaustion
    spike.js         # 0→500→0 VUs, 2min — resilience under sudden burst
  reports/           # gitignored — JSON + HTML output
  docker-compose.perf.yml   # full stack (dedicated perf DB) + k6 runner
  run.sh             # ./run.sh <scenario> [BASE_URL] — propagates k6 exit code
  README.md          # includes warnings for resource-intensive scenarios
.github/workflows/perf.yml
```

> Note: No `thresholds/` directory — thresholds are embedded inside each scenario's `options` export and switched via `__ENV.CI` environment variable (see Thresholds section).

---

## Shared Library Design

### `lib/auth.js`
Handles per-VU user lifecycle. Each VU calls `registerAndLogin(baseUrl, vuId)` at the **start of its first `default()` iteration** (guarded by a flag in VU state). This function:
1. Sends `POST /auth/register` with JSON body `{ username: "user_perf_<vuId>", password: "..." }`
2. Sends `POST /auth/login` with **`application/x-www-form-urlencoded`** body (`username=...&password=...`) — required because the backend uses FastAPI's `OAuth2PasswordRequestForm`
3. Returns the JWT token, stored in VU scope and reused for all subsequent iterations

> Important: Registration uses JSON; login uses form encoding. These two endpoints have different `Content-Type` requirements.

### `lib/client.js`
Thin wrapper around k6's `http` module. Pre-sets the `Authorization: Bearer <token>` header and base URL. All scenarios import this instead of using raw `http` calls.

### `lib/data.js`
Generates deterministic todo payloads using `vuId` and iteration index to ensure unique titles across parallel VUs. Prevents unique constraint violations and data collisions during concurrent runs.

---

## k6 Lifecycle Stages

| Stage | Function | Purpose |
|---|---|---|
| Default (first iter) | `default()` with VU-scope guard | Each VU registers its own user and logs in; token stored in VU variable. HTTP is only permitted here, not in the init stage. |
| Test loop | `default()` subsequent iterations | CRUD operations only — no auth overhead in measurements |
| Teardown | `teardown()` | Cleans up todos created during the run (see Database Isolation below) |

> Note: k6's init stage (top-level script code) **prohibits HTTP requests**. All network calls must be inside `default()` or `teardown()`. `setup()` is omitted — there is no global shared state needed at this stage.

---

## Database Isolation

`docker-compose.perf.yml` uses a **dedicated `postgres_perf` service** with database `tododb_perf` — separate from the development `postgres` service. This follows the same pattern as `docker-compose.e2e.yml`.

**Why:** Running against the shared dev database would pollute it with perf test users and todos.

**Test user cleanup:** The backend has no admin delete-user endpoint. Test users (created with username pattern `user_perf_<vuId>`) are not deleted. Todos are also not deleted — k6's `teardown()` runs in a separate context after all VUs finish and has no access to VU-scoped todo IDs, making reliable per-todo cleanup impractical without a shared-state mechanism.

This is acceptable because:
- The `postgres_perf` database is ephemeral — its volume can be pruned between local profiling sessions with `docker compose -f docker-compose.perf.yml down -v`
- CI always starts with a fresh `postgres_perf` container (no persistent volume between runs)
- `teardown()` is omitted entirely; the function does not exist in scenario scripts

**Repeated local runs:** `lib/auth.js` must handle `POST /auth/register` returning `409 Conflict` (username already taken from a prior run). When a 409 is received, the function skips registration and proceeds directly to login. This allows local reruns against a persistent perf volume without manual cleanup.

---

## Scenario Design

All scenarios execute the same per-iteration user journey:
1. `GET /todos` — list todos
2. `POST /todos` — create a todo
3. `PUT /todos/{id}` — update the created todo
4. `DELETE /todos/{id}` — delete the todo

| Scenario | VUs | Duration | Purpose |
|---|---|---|---|
| `smoke` | 1 | 30s | Verify all endpoints work before heavier runs |
| `load` | ramp 1→50→0 | 5min | Baseline — normal expected traffic |
| `stress` | ramp 1→200→0 | 10min | Find degradation/breaking point |
| `soak` | 20 steady | 30min | Detect memory leaks, connection exhaustion |
| `spike` | 0→500→0 | 2min | Resilience under sudden burst |

> **Warning:** `stress` and `spike` scenarios are resource-intensive. They should be run on a server or CI environment with adequate resources, not on a developer laptop. See README for guidance.

---

## Assertions: Checks + Thresholds

### Per-request checks (inline assertions)
Every request includes response checks:
```js
check(response, {
  'status is 201':   (r) => r.status === 201,
  'has todo id':     (r) => r.json('id') !== undefined,
  'title matches':   (r) => r.json('title') === payload.title,
});
```
Auth endpoints check for token presence and correct response shape.

### Thresholds (aggregate pass/fail gates)
Thresholds are embedded in each scenario's exported `options` object. Strict (CI) vs. relaxed (local) values are selected via the `__ENV.CI` environment variable:

```js
export const options = {
  thresholds: {
    http_req_duration: [__ENV.CI ? 'p(95)<500' : 'p(95)<1000'],
    http_req_failed:   [__ENV.CI ? 'rate<0.01' : 'rate<0.05'],
    checks:            [__ENV.CI ? 'rate>0.99' : 'rate>0.95'],
  },
};
```

CI sets `--env CI=true`. Local runs omit it, getting relaxed values.

---

## Infrastructure

### k6 Version
Both `docker-compose.perf.yml` and `perf.yml` pin to `grafana/k6:0.54.0` to ensure reproducible behavior.

### Local run via Docker Compose
`docker-compose.perf.yml` defines a dedicated perf stack with its own database:

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
      context: ./backend
    environment:
      - DATABASE_URL=postgresql+asyncpg://user:password@postgres_perf/tododb_perf
      - SECRET_KEY=perf-test-secret-key
    depends_on:
      postgres_perf:
        condition: service_healthy

  k6:
    image: grafana/k6:0.54.0
    volumes:
      - ./performance:/scripts
      - ./performance/reports:/reports
    environment:
      - BASE_URL=http://backend_perf:8000
    command: run /scripts/scenarios/smoke.js --out json=/reports/result.json
    depends_on:
      - backend_perf

volumes:
  postgres_perf_data:
```

### `run.sh` — local runner
```bash
./run.sh smoke                             # local Docker stack
./run.sh load https://staging.myapp.com   # against deployed env
./run.sh stress                            # local, stress scenario
```

- Accepts an optional `BASE_URL` argument to target any deployed environment
- **Propagates k6's exit code without modification** — a threshold breach exits non-zero, giving a clear signal before pushing

### GitHub Actions (`perf.yml`)
- **Trigger:** PR to main + push to main
- **Steps:**
  1. `docker compose -f docker-compose.perf.yml up -d postgres_perf backend_perf`
  2. Wait for backend health check
  3. `docker compose -f docker-compose.perf.yml run --env CI=true --env BASE_URL=http://backend_perf:8000 k6 run /scripts/scenarios/smoke.js --out json=/reports/smoke-result.json`
  4. Upload `reports/smoke-result.json` as a build artifact (`retention-days: 30`)
  5. Exit non-zero (fail PR) if k6 exits non-zero (threshold breached)

---

## Development Approach

- Branch: `feature/performance-framework`
- Developed in a git worktree for isolation from other in-progress work
- Added to existing repo under `/performance/` — keeps perf tests in sync with API changes
