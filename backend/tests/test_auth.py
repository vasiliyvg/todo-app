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
from auth import get_current_user

# NullPool engine for auth tests. Both this and test_endpoints.py's engine use
# the same DATABASE_URL + NullPool — functionally equivalent, last import wins
# the module-level patch but both point to the same DB so tests work correctly.
test_engine_auth = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)

database_module.engine = test_engine_auth
main_module.engine = test_engine_auth

client = TestClient(app)


@pytest.fixture(scope="session", autouse=True)
def create_tables_auth():
    async def setup():
        async with test_engine_auth.begin() as conn:
            await conn.run_sync(metadata.create_all)
    asyncio.run(setup())


@pytest.fixture(autouse=True)
def reset_auth_state():
    # Auth tests use real get_current_user — remove only the endpoint test mock, nothing else
    app.dependency_overrides.pop(get_current_user, None)
    async def truncate():
        async with test_engine_auth.begin() as conn:
            await conn.execute(text("TRUNCATE TABLE todos, users RESTART IDENTITY CASCADE"))
    asyncio.run(truncate())
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestRegister:
    def test_register_returns_token(self):
        response = client.post("/auth/register", json={"username": "alice", "password": "password123"})
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_register_duplicate_username_returns_409(self):
        client.post("/auth/register", json={"username": "alice", "password": "password123"})
        response = client.post("/auth/register", json={"username": "alice", "password": "password123"})
        assert response.status_code == 409

    def test_register_short_password_returns_422(self):
        response = client.post("/auth/register", json={"username": "alice", "password": "short"})
        assert response.status_code == 422


class TestLogin:
    def test_login_returns_token(self):
        client.post("/auth/register", json={"username": "alice", "password": "password123"})
        response = client.post("/auth/login", data={"username": "alice", "password": "password123"})
        assert response.status_code == 200
        assert "access_token" in response.json()

    def test_login_wrong_password_returns_401(self):
        client.post("/auth/register", json={"username": "alice", "password": "password123"})
        response = client.post("/auth/login", data={"username": "alice", "password": "wrongpassword"})
        assert response.status_code == 401

    def test_login_unknown_user_returns_401(self):
        response = client.post("/auth/login", data={"username": "nobody", "password": "password123"})
        assert response.status_code == 401


class TestTodosRequireAuth:
    def test_get_todos_without_token_returns_401(self):
        response = client.get("/todos")
        assert response.status_code == 401

    def test_get_todos_returns_only_current_user_todos(self):
        # Register two users
        r1 = client.post("/auth/register", json={"username": "alice", "password": "password123"})
        token_alice = r1.json()["access_token"]
        r2 = client.post("/auth/register", json={"username": "bob", "password": "password123"})
        token_bob = r2.json()["access_token"]

        # Alice creates a todo
        client.post("/todos", json={"title": "Alice's todo"},
                    headers={"Authorization": f"Bearer {token_alice}"})

        # Bob sees empty list
        response = client.get("/todos", headers={"Authorization": f"Bearer {token_bob}"})
        assert response.status_code == 200
        assert response.json() == []

        # Alice sees her todo
        response = client.get("/todos", headers={"Authorization": f"Bearer {token_alice}"})
        assert len(response.json()) == 1
        assert response.json()[0]["title"] == "Alice's todo"
