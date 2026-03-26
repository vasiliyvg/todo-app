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

Set `CI=true` env var to use strict thresholds locally: `CI=true ./performance/run.sh smoke`
