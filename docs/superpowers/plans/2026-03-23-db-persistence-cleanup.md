# Database Persistence Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead in-memory storage path from the backend, fix a Postgres healthcheck bug, and update the test suite to exercise real SQL instead of mocks.

**Architecture:** The Postgres code path already exists in every endpoint. This plan removes the parallel in-memory path and its supporting globals, leaving each endpoint as a single clean Postgres implementation. Tests switch from `AsyncMock` + globals reset to a real Postgres connection with per-test `TRUNCATE`. Task order keeps tests green at every step: infra fix → test fixture update (tests still pass via existing Postgres path) → remove dead production code → remove dead setting.

**Tech Stack:** FastAPI, SQLAlchemy Core (async), asyncpg, pytest, Docker Compose.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `docker-compose.yml` | Modify | Fix healthcheck DB name; remove `STORAGE_TYPE` env var (Task 1 + 4) |
| `backend/tests/test_endpoints.py` | Modify | Replace mock fixture with `NullPool` test engine + truncate fixtures (Task 2) |
| `backend/main.py` | Modify | Remove `todos_db`, `next_id`, all `if/else` branches, `STORAGE_TYPE` guard in lifespan (Task 3) |
| `backend/settings.py` | Modify | Remove `STORAGE_TYPE` field (Task 4) |

---

## Task 1: Fix docker-compose.yml healthcheck

**Files:**
- Modify: `docker-compose.yml`

The healthcheck targets database `myapp` but the actual database is `tododb`. This means the backend container can start before Postgres is truly ready, causing connection errors on startup.

- [ ] **Step 1: Fix the healthcheck DB name**

In `docker-compose.yml`, find line:
```yaml
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
```
Change to:
```yaml
      test: ["CMD-SHELL", "pg_isready -U user -d tododb"]
```

- [ ] **Step 2: Verify the change**

Run:
```bash
docker compose config | grep pg_isready
```
Expected output contains: `pg_isready -U user -d tododb`

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "fix: correct postgres healthcheck database name myapp -> tododb"
```

---

## Task 2: Update test fixture to use real Postgres

**Files:**
- Modify: `backend/tests/test_endpoints.py`

Replace the `AsyncMock`-based fixture (which forces `STORAGE_TYPE=in_memory` and resets module globals) with two pytest fixtures that use a `NullPool` test engine to truncate the real Postgres DB before each test.

`NullPool` is required because asyncpg connection pools are bound to the event loop that created them. `asyncio.run()` creates a new event loop per call; without `NullPool`, the second test would attempt to reuse a pool connection from a closed loop and raise `RuntimeError: Task attached to a different loop`.

The 13 test cases themselves are unchanged — only the fixture block at the top of the file changes.

- [ ] **Step 1: Replace the fixture block**

Replace the entire top of `backend/tests/test_endpoints.py` (everything before `class TestHealthCheck`) with:

```python
import asyncio
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine
from database import metadata
from settings import settings
from main import app

# Test-only engine: NullPool avoids asyncpg pool-per-event-loop issues
# when asyncio.run() is called repeatedly from sync pytest fixtures.
test_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)

client = TestClient(app)


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

The imports removed: `from unittest.mock import AsyncMock`, `import main as main_module`.
The functions removed: `async def mock_db_conn()`, the old `reset_state` fixture.

- [ ] **Step 2: Run the tests to verify all 13 pass**

```bash
docker compose run --rm backend python -m pytest tests/test_endpoints.py -v
```

Expected: all 13 tests PASS. The tests now hit real Postgres.

If tests fail with a connection error, Postgres may not be running — start it first:
```bash
docker compose up -d postgres
docker compose run --rm backend python -m pytest tests/test_endpoints.py -v
```

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_endpoints.py
git commit -m "test: replace AsyncMock fixture with real Postgres NullPool fixture"
```

---

## Task 3: Remove in-memory dead code from main.py

**Files:**
- Modify: `backend/main.py`

With tests already running against real Postgres, safely remove the dead in-memory path. Replace the entire file with the cleaned-up version — every endpoint is now 3–6 lines instead of 10+.

- [ ] **Step 1: Replace backend/main.py with the cleaned-up version**

```python
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncConnection

from models import Todo, TodoCreate, TodoUpdate
from settings import settings
from database import engine, todos, create_db_and_tables


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_db_and_tables()
    yield


app = FastAPI(title="Todo API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def get_db_conn() -> AsyncConnection:
    async with engine.connect() as connection:
        yield connection


@app.get("/")
async def root():
    return {"message": "Todo API is running"}


@app.get("/todos", response_model=List[Todo])
async def get_todos(conn: AsyncConnection = Depends(get_db_conn)):
    result = await conn.execute(todos.select())
    return result.mappings().all()


async def get_todo_by_id(todo_id: int, conn: AsyncConnection):
    result = await conn.execute(todos.select().where(todos.c.id == todo_id))
    todo = result.mappings().first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo


@app.get("/todos/{todo_id}", response_model=Todo)
async def get_todo(todo_id: int, conn: AsyncConnection = Depends(get_db_conn)):
    return await get_todo_by_id(todo_id, conn)


@app.post("/todos", response_model=Todo, status_code=201)
async def create_todo(todo_create: TodoCreate, conn: AsyncConnection = Depends(get_db_conn)):
    now = datetime.now(timezone.utc)
    todo_type = todo_create.type if todo_create.type else "todo"
    query = todos.insert().values(
        title=todo_create.title, completed=False, created_at=now, updated_at=now, type=todo_type
    )
    result = await conn.execute(query)
    await conn.commit()
    new_id = result.inserted_primary_key[0]
    return await get_todo_by_id(new_id, conn)


@app.put("/todos/{todo_id}", response_model=Todo)
async def update_todo(todo_id: int, todo_update: TodoUpdate, conn: AsyncConnection = Depends(get_db_conn)):
    now = datetime.now(timezone.utc)
    update_data = todo_update.model_dump(exclude_unset=True)
    update_data["updated_at"] = now
    query = todos.update().where(todos.c.id == todo_id).values(**update_data)
    result = await conn.execute(query)
    await conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Todo not found")
    return await get_todo_by_id(todo_id, conn)


@app.delete("/todos/{todo_id}", status_code=204)
async def delete_todo(todo_id: int, conn: AsyncConnection = Depends(get_db_conn)):
    query = todos.delete().where(todos.c.id == todo_id)
    result = await conn.execute(query)
    await conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Todo not found")
    return


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
```

Removed: `todos_db`, `next_id`, all `if settings.STORAGE_TYPE == "postgres":` branches, all `global todos_db` / `global next_id` declarations, the `STORAGE_TYPE` guard in `lifespan`.

Note: `from settings import settings` is kept because `settings.DATABASE_URL` is still used in `database.py` (imported at module level). It can be removed from `main.py` imports since `main.py` no longer references `settings` directly — see step below.

- [ ] **Step 2: Remove the unused `settings` import from main.py**

Since `main.py` no longer references `settings` directly (only `database.py` uses it), remove this line:

```python
from settings import settings
```

The file's import block should now be:

```python
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncConnection

from models import Todo, TodoCreate, TodoUpdate
from database import engine, todos, create_db_and_tables
```

- [ ] **Step 3: Run all backend tests**

```bash
docker compose run --rm backend python -m pytest tests/ -v
```

Expected: all tests in `test_main.py` and `test_endpoints.py` PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "refactor: remove in-memory storage dead code from main.py"
```

---

## Task 4: Remove STORAGE_TYPE from settings and docker-compose

**Files:**
- Modify: `backend/settings.py`
- Modify: `docker-compose.yml`

`STORAGE_TYPE` no longer controls anything in the codebase. Remove it from settings and from docker-compose.

- [ ] **Step 1: Remove STORAGE_TYPE from settings.py**

Replace `backend/settings.py` with:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8')

    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost/tododb"

settings = Settings()
```

- [ ] **Step 2: Remove STORAGE_TYPE from docker-compose.yml backend environment**

In `docker-compose.yml`, remove the line `- STORAGE_TYPE=postgres` from the `backend` service's `environment` block. The backend environment block should become:

```yaml
    environment:
      - PYTHONUNBUFFERED=1
      - PYTHONPATH=/app
      - DATABASE_URL=postgresql+asyncpg://user:password@postgres/tododb
```

- [ ] **Step 3: Run all backend tests**

```bash
docker compose run --rm backend python -m pytest tests/ -v
```

Expected: all tests PASS. (Without `STORAGE_TYPE` in the environment, `settings.py` simply has no such field — no impact since nothing reads it anymore.)

- [ ] **Step 4: Commit**

```bash
git add backend/settings.py docker-compose.yml
git commit -m "refactor: remove STORAGE_TYPE setting, Postgres is now the only storage backend"
```

---

## Final verification

- [ ] **Run the full test suite**

```bash
docker compose run --rm backend python -m pytest tests/ -v
```

Expected: all tests in both `test_main.py` and `test_endpoints.py` PASS.

- [ ] **Smoke-test the running app**

```bash
docker compose up -d
curl http://localhost:8000/
curl http://localhost:8000/todos
docker compose down
```

Expected: `{"message": "Todo API is running"}` and `[]`.
