import asyncio
import pytest
import main as main_module
import database as database_module
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

# Patch both the database module and main module engine references to use NullPool
# so that asyncpg connections are not reused across different event loops.
database_module.engine = test_engine
main_module.engine = test_engine

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


class TestHealthCheck:
    def test_root_returns_200(self):
        response = client.get("/")
        assert response.status_code == 200


class TestGetTodos:
    def test_returns_empty_list_initially(self):
        response = client.get("/todos")
        assert response.status_code == 200
        assert response.json() == []

    def test_returns_todos_after_creation(self):
        client.post("/todos", json={"title": "Task A"})
        response = client.get("/todos")
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["title"] == "Task A"


class TestCreateTodo:
    def test_creates_todo_with_default_type(self):
        response = client.post("/todos", json={"title": "My task"})
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "My task"
        assert data["type"] == "todo"
        assert data["completed"] is False

    def test_creates_todo_with_explicit_timeline_type(self):
        response = client.post("/todos", json={"title": "Milestone", "type": "timeline"})
        assert response.status_code == 201
        assert response.json()["type"] == "timeline"

    def test_returns_422_for_missing_title(self):
        response = client.post("/todos", json={})
        assert response.status_code == 422


class TestGetTodoById:
    def test_returns_correct_todo(self):
        created = client.post("/todos", json={"title": "Find me"}).json()
        response = client.get(f"/todos/{created['id']}")
        assert response.status_code == 200
        assert response.json()["title"] == "Find me"

    def test_returns_404_for_unknown_id(self):
        response = client.get("/todos/9999")
        assert response.status_code == 404


class TestUpdateTodo:
    def test_updates_completed_status(self):
        created = client.post("/todos", json={"title": "Toggle me"}).json()
        response = client.put(f"/todos/{created['id']}", json={"completed": True})
        assert response.status_code == 200
        assert response.json()["completed"] is True

    def test_updates_title(self):
        created = client.post("/todos", json={"title": "Old title"}).json()
        response = client.put(f"/todos/{created['id']}", json={"title": "New title"})
        assert response.status_code == 200
        assert response.json()["title"] == "New title"

    def test_returns_404_for_unknown_id(self):
        response = client.put("/todos/9999", json={"completed": True})
        assert response.status_code == 404


class TestDeleteTodo:
    def test_deletes_todo_successfully(self):
        created = client.post("/todos", json={"title": "Delete me"}).json()
        response = client.delete(f"/todos/{created['id']}")
        assert response.status_code == 204
        assert client.get(f"/todos/{created['id']}").status_code == 404

    def test_returns_404_for_unknown_id(self):
        response = client.delete("/todos/9999")
        assert response.status_code == 404
