import unittest
from datetime import datetime
from pydantic import ValidationError
from models import Todo, TodoCreate, TodoUpdate

class TestTodoModels(unittest.TestCase):
    def test_todo_create(self):
        todo_create = TodoCreate(title="Test Todo")
        self.assertEqual(todo_create.title, "Test Todo")

    def test_todo_create_empty_title(self):
        with self.assertRaises(ValidationError):
            TodoCreate(title="")

    def test_todo_create_missing_title(self):
        with self.assertRaises(ValidationError):
            TodoCreate()

    def test_todo_update_partial(self):
        todo_update = TodoUpdate(title="Updated Title")
        self.assertEqual(todo_update.title, "Updated Title")
        self.assertIsNone(todo_update.completed)

    def test_todo_update_completed(self):
        todo_update = TodoUpdate(completed=True)
        self.assertTrue(todo_update.completed)
        self.assertIsNone(todo_update.title)

    def test_todo_update_none(self):
        todo_update = TodoUpdate()
        self.assertIsNone(todo_update.title)
        self.assertIsNone(todo_update.completed)

    def test_todo_model(self):
        now = datetime.now()
        todo = Todo(
            id=1,
            title="Test",
            completed=False,
            created_at=now,
            updated_at=now
        )
        self.assertEqual(todo.id, 1)
        self.assertEqual(todo.title, "Test")
        self.assertFalse(todo.completed)
        self.assertEqual(todo.created_at, now)
        self.assertEqual(todo.updated_at, now)

    def test_todo_model_missing_fields(self):
        now = datetime.now()
        with self.assertRaises(ValidationError):
            Todo(
                id=1,
                title="Test",
                completed=False,
                created_at=now
                # missing updated_at
            )

    def test_todo_model_wrong_types(self):
        now = datetime.now()
        with self.assertRaises(ValidationError):
            Todo(
                id="one",  # should be int
                title=123,  # should be str
                completed="no",  # should be bool
                created_at="now",  # should be datetime
                updated_at=now
            )