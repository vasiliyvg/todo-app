# Full Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unit tests for all uncovered frontend components/services and backend endpoints to reach ~80% coverage.

**Architecture:** One new test file per module. No production code changes. Frontend uses Jest + React Testing Library; backend uses pytest + FastAPI TestClient with in-memory storage and dependency overrides to avoid real DB connections.

**Tech Stack:** Jest, @testing-library/react, @testing-library/jest-dom (frontend); pytest, FastAPI TestClient, unittest.mock (backend).

---

## File Map

| New file | What it tests |
|---|---|
| `frontend/src/components/TodoItem.test.tsx` | `TodoItem` component |
| `frontend/src/components/TodoList.test.tsx` | `TodoList` component |
| `frontend/src/components/TodoForm.test.tsx` | `TodoForm` component |
| `frontend/src/components/Timeline.test.tsx` | `TimelineComponent` |
| `frontend/src/services/api.test.ts` | `api.ts` service functions |
| `backend/tests/test_endpoints.py` | All FastAPI endpoints |

---

## Task 1: TodoItem tests

**Files:**
- Create: `frontend/src/components/TodoItem.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodoItem from './TodoItem';
import { Todo } from '../types/todo';

const mockTodo: Todo = {
  id: 1,
  title: 'Buy milk',
  completed: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  type: 'todo',
};

describe('TodoItem', () => {
  const toggleComplete = jest.fn();
  const deleteTodo = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  test('renders todo title', () => {
    render(<TodoItem todo={mockTodo} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  test('renders checkbox as unchecked when todo is not completed', () => {
    render(<TodoItem todo={mockTodo} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  test('renders checkbox as checked when todo is completed', () => {
    render(<TodoItem todo={{ ...mockTodo, completed: true }} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('applies line-through style when todo is completed', () => {
    render(<TodoItem todo={{ ...mockTodo, completed: true }} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    // The div wrapping the checkbox and span has the style applied
    const styledDiv = screen.getByText('Buy milk').parentElement;
    expect(styledDiv).toHaveStyle('text-decoration: line-through');
  });

  test('calls toggleComplete with todo id when checkbox is clicked', () => {
    render(<TodoItem todo={mockTodo} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(toggleComplete).toHaveBeenCalledWith(1);
  });

  test('calls deleteTodo with todo id when delete button is clicked', () => {
    render(<TodoItem todo={mockTodo} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(deleteTodo).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=TodoItem.test
```

Expected: all 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TodoItem.test.tsx
git commit -m "test: add TodoItem unit tests"
```

---

## Task 2: TodoList tests

**Files:**
- Create: `frontend/src/components/TodoList.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodoList from './TodoList';
import { Todo } from '../types/todo';

const makeTodo = (id: number, title: string): Todo => ({
  id,
  title,
  completed: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  type: 'todo',
});

describe('TodoList', () => {
  const toggleComplete = jest.fn();
  const deleteTodo = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  test('renders correct number of todo items', () => {
    const todos = [makeTodo(1, 'First'), makeTodo(2, 'Second'), makeTodo(3, 'Third')];
    render(<TodoList todos={todos} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  test('renders nothing when todos array is empty', () => {
    render(<TodoList todos={[]} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  test('passes callbacks to each item — verified by clicking first and second item', () => {
    const todos = [makeTodo(1, 'First'), makeTodo(2, 'Second')];
    render(<TodoList todos={todos} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(toggleComplete).toHaveBeenCalledWith(1);
    fireEvent.click(checkboxes[1]);
    expect(toggleComplete).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=TodoList.test
```

Expected: all 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TodoList.test.tsx
git commit -m "test: add TodoList unit tests"
```

---

## Task 3: TodoForm tests

**Files:**
- Create: `frontend/src/components/TodoForm.test.tsx`

Note: `TodoForm` declares `addTodo(text: string, type: string)` as its prop and calls it with both arguments. This is the component's own contract. The fact that `App.tsx` currently passes a one-argument function is a pre-existing integration mismatch — do not try to "fix" it here.

- [ ] **Step 1: Create the test file**

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodoForm from './TodoForm';

describe('TodoForm', () => {
  const addTodo = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  test('renders text input and type selector', () => {
    render(<TodoForm addTodo={addTodo} />);
    expect(screen.getByPlaceholderText(/Add a new task/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  test('calls addTodo with entered text and selected type on submit', () => {
    render(<TodoForm addTodo={addTodo} />);
    fireEvent.change(screen.getByPlaceholderText(/Add a new task/i), { target: { value: 'Buy bread' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'timeline' } });
    fireEvent.submit(screen.getByRole('button', { name: /add/i }).closest('form')!);
    expect(addTodo).toHaveBeenCalledWith('Buy bread', 'timeline');
  });

  test('clears text input after successful submission', () => {
    render(<TodoForm addTodo={addTodo} />);
    const input = screen.getByPlaceholderText(/Add a new task/i);
    fireEvent.change(input, { target: { value: 'Buy bread' } });
    fireEvent.submit(input.closest('form')!);
    expect(input).toHaveValue('');
  });

  test('does not call addTodo when text input is empty', () => {
    render(<TodoForm addTodo={addTodo} />);
    fireEvent.submit(screen.getByPlaceholderText(/Add a new task/i).closest('form')!);
    expect(addTodo).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=TodoForm.test
```

Expected: all 4 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TodoForm.test.tsx
git commit -m "test: add TodoForm unit tests"
```

---

## Task 4: Timeline tests

**Files:**
- Create: `frontend/src/components/Timeline.test.tsx`

Note: `TimelineComponent` renders ALL todos passed to it via props — it does not filter by `type` internally. Filtering happens in `App.tsx` before passing the prop. Tests reflect the component's actual behavior, not the intended filtering behavior.

The component also has a known rendering bug (todo title is crammed into the circular marker). Tests cover the current behavior; do not fix the bug.

- [ ] **Step 1: Create the test file**

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TimelineComponent from './Timeline';
import { Todo } from '../types/todo';

const makeTodo = (id: number, title: string): Todo => ({
  id,
  title,
  completed: false,
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
  type: 'timeline',
});

describe('TimelineComponent', () => {
  test('renders without crashing with an empty todos array', () => {
    const { container } = render(<TimelineComponent todos={[]} />);
    expect(container).toBeInTheDocument();
  });

  test('renders correct number of timeline entries for each todo in the passed array', () => {
    const todos = [makeTodo(1, 'Event A'), makeTodo(2, 'Event B'), makeTodo(3, 'Event C')];
    render(<TimelineComponent todos={todos} />);
    // Each entry renders the title once (inside the circular marker)
    // Use selector: 'span' to avoid matching both the span and its parent div (which has the same text content)
    expect(screen.getAllByText(/Event [ABC]/, { selector: 'span' })).toHaveLength(3);
  });

  test('renders todo titles in the timeline', () => {
    render(<TimelineComponent todos={[makeTodo(1, 'Release v1.0')]} />);
    expect(screen.getByText('Release v1.0')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=Timeline.test
```

Expected: all 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Timeline.test.tsx
git commit -m "test: add Timeline unit tests"
```

---

## Task 5: api.ts service tests

**Files:**
- Create: `frontend/src/services/api.test.ts`

`addTodo` in `api.ts` accepts exactly one argument (`text: string`) and sends `{ title: text }`. Do not pass a second `type` argument.

- [ ] **Step 1: Create the test file**

```ts
import { getTodos, addTodo, updateTodo, deleteTodo } from './api';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockTodo = {
  id: 1,
  title: 'Test',
  completed: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  type: 'todo',
};

beforeEach(() => mockFetch.mockClear());

describe('getTodos', () => {
  test('calls GET /todos and returns parsed JSON', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [mockTodo] });
    const result = await getTodos();
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos');
    expect(result).toEqual([mockTodo]);
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(getTodos()).rejects.toThrow('Failed to fetch todos');
  });
});

describe('addTodo', () => {
  test('calls POST /todos with correct body and headers and returns created todo', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockTodo });
    const result = await addTodo('Test');
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test' }),
    });
    expect(result).toEqual(mockTodo);
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(addTodo('Test')).rejects.toThrow('Failed to add todo');
  });
});

describe('updateTodo', () => {
  test('calls PUT /todos/{id} with correct body and returns updated todo', async () => {
    const updated = { ...mockTodo, completed: true };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => updated });
    const result = await updateTodo(1, { completed: true });
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    expect(result).toEqual(updated);
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(updateTodo(1, { completed: true })).rejects.toThrow('Failed to update todo');
  });
});

describe('deleteTodo', () => {
  test('calls DELETE /todos/{id}', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await deleteTodo(1);
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/todos/1', { method: 'DELETE' });
  });

  test('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(deleteTodo(1)).rejects.toThrow('Failed to delete todo');
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=api.test
```

Expected: all 9 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.test.ts
git commit -m "test: add api service unit tests"
```

---

## Task 6: Backend endpoint tests

**Files:**
- Create: `backend/tests/test_endpoints.py`

**Important — state isolation:** `main.py` uses module-level globals `todos_db` (a list) and `next_id` (an int). The `delete_todo` handler rebinds `todos_db` at module level via `global todos_db`. To reliably reset state between tests, the fixture **must** do `import main as main_module; main_module.todos_db = []; main_module.next_id = 1` — not `from main import todos_db; todos_db = []`, which rebinds a local name and leaves the module's global unchanged.

**Important — DB dependency:** Even in in-memory mode, the `get_db_conn` FastAPI dependency will attempt to open a real database connection on every request. Override it with an `AsyncMock` so tests never touch Postgres. The in-memory code paths never use the `conn` argument, so the mock value is never called.

**Important — STORAGE_TYPE:** `settings.py` defaults `STORAGE_TYPE` to `"in_memory"`, so no environment variable setup is needed for tests.

- [ ] **Step 1: Create the test file**

```python
import pytest
import main as main_module
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from main import app, get_db_conn


async def mock_db_conn():
    """Override get_db_conn to avoid real Postgres connections in unit tests."""
    yield AsyncMock()


@pytest.fixture(autouse=True)
def reset_state():
    """Override DB dependency and reset in-memory globals before each test."""
    app.dependency_overrides[get_db_conn] = mock_db_conn
    main_module.todos_db = []
    main_module.next_id = 1
    yield
    app.dependency_overrides.clear()
    main_module.todos_db = []
    main_module.next_id = 1


client = TestClient(app)


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
```

- [ ] **Step 2: Run the tests**

```bash
cd backend && pytest tests/test_endpoints.py -v
```

Expected: all 13 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_endpoints.py
git commit -m "test: add FastAPI endpoint unit tests"
```

---

## Final verification

- [ ] **Run all frontend tests**

```bash
cd frontend && npm test -- --watchAll=false
```

Expected: all test suites pass (App, TodoItem, TodoList, TodoForm, Timeline, api)

- [ ] **Run all backend tests**

```bash
cd backend && pytest tests/ -v
```

Expected: all test suites pass (test_main, test_endpoints)
