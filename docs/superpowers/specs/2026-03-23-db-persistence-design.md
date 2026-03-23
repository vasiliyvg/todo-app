# Database Persistence Cleanup Design

**Date:** 2026-03-23

## Goal

The backend already has a working Postgres code path wired through SQLAlchemy Core. The in-memory storage path is dead code in production (Docker always sets `STORAGE_TYPE=postgres`). This spec covers removing that dead code, fixing a healthcheck bug, and updating the test setup to use a real Postgres connection instead of mocks.

## Context

- `docker-compose.yml` starts a `postgres` service and sets `STORAGE_TYPE=postgres` on the backend container — Postgres is always the runtime DB.
- Every endpoint in `main.py` contains an `if STORAGE_TYPE == "postgres": ... else: in_memory` branch, duplicating logic and carrying dead module-level globals (`todos_db`, `next_id`).
- `test_endpoints.py` works around the dual-path by forcing `STORAGE_TYPE=in_memory`, mocking `get_db_conn` with `AsyncMock`, and resetting the globals. The tests never exercise real SQL.
- CI runs `docker compose run --rm backend pytest`, which starts the Postgres service first (`depends_on: condition: service_healthy`), so Postgres is available during tests.

## Changes

### `backend/main.py`

Remove:
- Module-level `todos_db: List[Todo] = []` and `next_id = 1`
- All `if settings.STORAGE_TYPE == "postgres": ... else:` branches in every endpoint
- All `global todos_db` / `global next_id` declarations
- The `STORAGE_TYPE` guard in the `lifespan` function — always call `create_db_and_tables()`

Keep the Postgres code path in each endpoint as the single implementation. Result is ~40 lines shorter with each endpoint reduced to 3–6 lines.

### `backend/settings.py`

Remove the `STORAGE_TYPE` field entirely — it no longer controls anything.

### `docker-compose.yml`

Two changes:
1. Remove `STORAGE_TYPE=postgres` from the backend `environment` block (setting no longer exists).
2. Fix healthcheck bug: `pg_isready -U user -d myapp` → `pg_isready -U user -d tododb`.

### `backend/tests/test_endpoints.py`

Replace the current fixture with one that uses a real Postgres connection. asyncpg connection pools are event-loop-bound, so a test-only engine with `NullPool` is used — each call opens and closes a fresh connection, making it safe to call from `asyncio.run()` across multiple tests without pool/loop conflicts:

```python
import asyncio
from sqlalchemy import text
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine
from database import metadata
from settings import settings

# Test-only engine: NullPool avoids asyncpg pool-per-event-loop issues
# when asyncio.run() is called repeatedly from sync pytest fixtures.
test_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)


@pytest.fixture(scope="session", autouse=True)
def create_tables():
    """Create the todos table once before any test runs."""
    async def setup():
        async with test_engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
    asyncio.run(setup())


@pytest.fixture(autouse=True)
def reset_state():
    """Truncate todos table before each test for isolation."""
    async def truncate():
        async with test_engine.begin() as conn:
            await conn.execute(text("TRUNCATE TABLE todos RESTART IDENTITY"))
    asyncio.run(truncate())
    yield
```

Note: `get_db_conn` and `AsyncConnection` in `main.py` remain untouched — they are the Postgres path, not dead code. The app's production `engine` (with pooling) is unaffected; `test_engine` is only used in the test fixtures.

Remove the `AsyncMock` import, `mock_db_conn`, and all `main_module.todos_db` / `main_module.next_id` / `main_module.settings.STORAGE_TYPE` manipulation.

The 13 test cases (assertions, inputs, expected status codes) are unchanged.

### `backend/requirements.txt`

No changes — `asyncpg` and `SQLAlchemy` are already present.

## Developer Workflow Note

Removing `STORAGE_TYPE` means running `uvicorn main:app` directly (without Docker) will attempt to connect to Postgres immediately via `create_db_and_tables()`. Without a local Postgres instance, startup will fail. The supported local dev workflow remains `docker compose up`, same as today.

## Testing Strategy

Tests use the real Postgres DB running via Docker. Isolation is achieved by truncating `todos` (with `RESTART IDENTITY` to reset the auto-increment counter) before each test. Running tests requires `docker compose run --rm backend pytest` — bare `pytest` without Docker is not supported (same constraint as today).

## Files Changed

| File | Change |
|---|---|
| `backend/main.py` | Remove in-memory branches, globals, STORAGE_TYPE guard in lifespan |
| `backend/settings.py` | Remove `STORAGE_TYPE` field |
| `docker-compose.yml` | Fix healthcheck DB name, remove `STORAGE_TYPE` env var |
| `backend/tests/test_endpoints.py` | Replace mock fixture with Postgres truncate fixture |
