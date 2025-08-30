import unittest
from fastapi.testclient import TestClient
from main import app

class TestTodoAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_root(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"message": "Todo API is running"})

    def test_create_todo(self):
        response = self.client.post("/todos", json={"title": "Test Todo"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["title"], "Test Todo")
        self.assertFalse(data["completed"])
        self.assertIn("id", data)
        self.assertIn("created_at", data)
        self.assertIn("updated_at", data)

    def test_get_todos(self):
        # Create a todo first
        self.client.post("/todos", json={"title": "Another Todo"})
        response = self.client.get("/todos")
        self.assertEqual(response.status_code, 200)
        todos = response.json()
        self.assertTrue(isinstance(todos, list))
        self.assertGreaterEqual(len(todos), 1)

    def test_get_todo(self):
        # Create a todo and get its id
        create_resp = self.client.post("/todos", json={"title": "Find Me"})
        todo_id = create_resp.json()["id"]
        response = self.client.get(f"/todos/{todo_id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "Find Me")

    def test_get_todo_not_found(self):
        response = self.client.get("/todos/99999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Todo not found")

    def test_update_todo(self):
        create_resp = self.client.post("/todos", json={"title": "To Update"})
        todo_id = create_resp.json()["id"]
        response = self.client.put(f"/todos/{todo_id}", json={"title": "Updated", "completed": True})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["title"], "Updated")
        self.assertTrue(data["completed"])

    def test_update_todo_not_found(self):
        response = self.client.put("/todos/99999", json={"title": "Nope"})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Todo not found")

    def test_delete_todo(self):
        create_resp = self.client.post("/todos", json={"title": "To Delete"})
        todo_id = create_resp.json()["id"]
        response = self.client.delete(f"/todos/{todo_id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Todo deleted successfully")

    def test_delete_todo_not_found(self):
        response = self.client.delete("/todos/99999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Todo not found")