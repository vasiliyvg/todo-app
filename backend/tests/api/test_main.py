import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from ...main import app
from ...database import metadata, engine


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(metadata.drop_all)


@pytest.fixture(scope="function")
def client():
    return TestClient(app)


def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Todo API is running"}


def test_create_todo(client):
    response = client.post("/todos", json={"title": "Test Todo"})
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Todo"
    assert not data["completed"]
    assert "id" in data


def test_get_todos(client):
    client.post("/todos", json={"title": "Todo 1"})
    client.post("/todos", json={"title": "Todo 2"})
    response = client.get("/todos")
    assert response.status_code == 200
    todos = response.json()
    assert isinstance(todos, list)
    assert len(todos) == 2


def test_get_todo(client):
    create_resp = client.post("/todos", json={"title": "Find Me"})
    todo_id = create_resp.json()["id"]
    response = client.get(f"/todos/{todo_id}")
    assert response.status_code == 200
    assert response.json()["title"] == "Find Me"


def test_get_todo_not_found(client):
    response = client.get("/todos/99999")
    assert response.status_code == 404


def test_update_todo(client):
    create_resp = client.post("/todos", json={"title": "To Update"})
    todo_id = create_resp.json()["id"]
    response = client.put(f"/todos/{todo_id}", json={"title": "Updated", "completed": True})
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated"
    assert data["completed"]


def test_update_todo_not_found(client):
    response = client.put("/todos/99999", json={"title": "Nope"})
    assert response.status_code == 404


def test_delete_todo(client):
    create_resp = client.post("/todos", json={"title": "To Delete"})
    todo_id = create_resp.json()["id"]
    response = client.delete(f"/todos/{todo_id}")
    assert response.status_code == 204

    # Verify it's gone
    get_resp = client.get(f"/todos/{todo_id}")
    assert get_resp.status_code == 404


def test_delete_todo_not_found(client):
    response = client.delete("/todos/99999")
    assert response.status_code == 404
