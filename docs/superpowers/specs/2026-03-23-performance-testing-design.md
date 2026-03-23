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
  thresholds/
    ci.json          # strict: p95 < 500ms, error rate < 1%, checks > 99%
    local.json       # relaxed: p95 < 1s
  reports/           # gitignored — JSON + HTML output
  docker-compose.perf.yml   # full stack + k6 runner
  run.sh             # ./run.sh <scenario> [BASE_URL]
  README.md
.github/workflows/perf.yml
```

---

## Shared Library Design

### `lib/auth.js`
Handles per-VU user lifecycle. Each VU registers a unique test user (e.g., `user_perf_<vuId>`) and logs in once during the VU init stage. The token is reused across all iterations for that VU — mirroring real user behavior.

### `lib/client.js`
Thin wrapper around k6's `http` module. Pre-sets the `Authorization: Bearer <token>` header and base URL. All scenarios import this instead of using raw `http` calls, ensuring consistent headers and default response checks.

### `lib/data.js`
Generates deterministic todo payloads using `vuId` and iteration index to ensure unique titles across parallel VUs. Prevents unique constraint violations and data collisions during concurrent runs.

---

## k6 Lifecycle Stages

| Stage | Function | Purpose |
|---|---|---|
| Init | VU-level code (top of file) | Each VU registers its own user and logs in; token stored in VU scope |
| Setup | `setup()` | Global one-time prep (shared test data if needed in future) |
| Test loop | `default(data)` | CRUD operations only — no auth overhead in measurements |
| Teardown | `teardown(data)` | Delete test users and todos created during the run |

This ensures registration and login costs are completely excluded from latency measurements.

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
Auth endpoints also check token presence and format.

### Thresholds (aggregate pass/fail gates)
Defined in `thresholds/ci.json`, applied in CI:
- `http_req_duration p(95) < 500ms`
- `http_req_failed rate < 1%`
- `checks pass rate > 99%`

Relaxed values in `thresholds/local.json` for developer machines.

---

## Infrastructure

### Local run via Docker Compose
`docker-compose.perf.yml` extends the existing `docker-compose.yml`, adding a k6 service that targets the backend container directly:

```yaml
services:
  k6:
    image: grafana/k6
    volumes:
      - ./performance:/scripts
    environment:
      - BASE_URL=http://backend:8000
    command: run /scripts/scenarios/smoke.js
    depends_on:
      - backend
```

### `run.sh` — local runner
```bash
./run.sh smoke                             # local Docker stack
./run.sh load https://staging.myapp.com   # against deployed env
./run.sh stress                            # local, stress scenario
```

Accepts an optional `BASE_URL` argument to target any deployed environment.

### GitHub Actions (`perf.yml`)
- **Trigger:** PR to main + push to main
- **Steps:**
  1. `docker compose up` (postgres + backend)
  2. `k6 run scenarios/smoke.js --env BASE_URL=http://localhost:8000 --thresholds-file thresholds/ci.json`
  3. Upload `reports/smoke-result.json` as a build artifact
  4. Exit non-zero (fail PR) if any threshold is breached

### Reports
- JSON output → `reports/` (gitignored, not committed)
- CI artifacts stored per run for trend comparison
- `handleSummary()` in each scenario generates a human-readable HTML report

---

## Development Approach

- Branch: `feature/performance-framework`
- Developed in a git worktree for isolation from other in-progress work
- Added to existing repo under `/performance/` — keeps perf tests in sync with API changes
