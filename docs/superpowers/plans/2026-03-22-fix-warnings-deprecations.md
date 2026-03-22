# Fix Warnings and Deprecations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all deprecation warnings in our own source code across the backend (Python) and frontend (TypeScript/React) without changing any production behavior.

**Architecture:** Four independent, mechanical fixes across four files — each can be committed separately. Existing tests serve as regression protection. No new tests are written (the changes are warning-silencing refactors, not behavior changes). Backend: fix Pydantic V2 `class Config`, fix `datetime.utcnow()` in main.py and database.py. Frontend: wrap `fireEvent` calls in `act(async () => { ... })` in App.test.tsx.

**Tech Stack:** Python 3.12, Pydantic V2, SQLAlchemy 2 (async), React 18, @testing-library/react v13

---

## Files Modified

| File | What changes |
|---|---|
| `backend/models.py` | `class Config` → `model_config = ConfigDict(...)` |
| `backend/main.py` | `datetime.utcnow()` → `datetime.now(timezone.utc)` (lines 69, 93) |
| `backend/database.py` | `datetime.utcnow` → `lambda: datetime.now(timezone.utc)` (lines 23–24) |
| `frontend/src/App.test.tsx` | Wrap `fireEvent` blocks in `act(async () => { ... })` (4 tests) |

---

### Task 1: Fix Pydantic V2 `class Config` deprecation in `models.py`

**Files:**
- Modify: `backend/models.py:1,27-28`

Two Pydantic V2 fixes in this file:
1. `@field_validator` must have an explicit `@classmethod` decorator in Pydantic V2.
2. The `class Config` inner class is deprecated — replace with `model_config = ConfigDict(from_attributes=True)`.

- [ ] **Step 1: Verify the current warning fires**

```bash
cd /Users/vasylbyk/projects/todo-app/backend
source venv/bin/activate
python -W error::DeprecationWarning -c "import models" 2>&1 || python -c "import models" 2>&1 | grep -i "deprecat\|warn" || echo "No warning captured via import — run tests to see it"
python -m pytest tests/test_endpoints.py -v -W default 2>&1 | grep -i "deprecat\|PydanticDeprecated" | head -5
```

Expected: output contains something like `PydanticDeprecatedSince20` or `DeprecationWarning`.

- [ ] **Step 2: Apply the fix**

Edit `backend/models.py`. The final file must look exactly like this:

```python
from pydantic import BaseModel, field_validator, ConfigDict
from typing import Optional
from datetime import datetime

class TodoCreate(BaseModel):
    title: str
    type: Optional[str] = "todo"

    @field_validator('title')
    @classmethod
    def title_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Title must not be empty')
        return v

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    completed: Optional[bool] = None

class Todo(BaseModel):
    id: int
    title: str
    completed: bool
    created_at: datetime
    updated_at: datetime
    type: str

    model_config = ConfigDict(from_attributes=True)
```

Key changes:
- Line 1: add `ConfigDict` to existing pydantic import
- After `@field_validator('title')`: add `@classmethod` on the next line
- Lines 27–28: replace `class Config:\n    from_attributes = True` with `model_config = ConfigDict(from_attributes=True)`

- [ ] **Step 3: Run backend tests to confirm no regression**

```bash
cd /Users/vasylbyk/projects/todo-app/backend
python -m pytest tests/test_endpoints.py -v 2>&1 | tail -20
```

Expected: `13 passed` — same as before.

- [ ] **Step 4: Commit**

```bash
cd /Users/vasylbyk/projects/todo-app
git add backend/models.py
git commit -m "fix: replace deprecated Pydantic V2 class Config with model_config"
```

---

### Task 2: Fix `datetime.utcnow()` deprecation in `main.py`

**Files:**
- Modify: `backend/main.py:1,69,93`

`datetime.utcnow()` is deprecated since Python 3.12. Replace with `datetime.now(timezone.utc)`.

- [ ] **Step 1: Locate the import line and both call sites**

```bash
grep -n "utcnow\|from datetime" /Users/vasylbyk/projects/todo-app/backend/main.py
```

Expected output includes:
- `from datetime import datetime` (top of file)
- line 69: `now = datetime.utcnow()`
- line 93: `now = datetime.utcnow()`

- [ ] **Step 2: Apply the fix**

Two edits to `backend/main.py`:

**Edit 1** — update the import (find the existing import line):
```python
# Before
from datetime import datetime

# After
from datetime import datetime, timezone
```

**Edit 2** — replace both `utcnow()` calls (there are exactly two, both identical):
```python
# Before (appears twice, lines 69 and 93)
now = datetime.utcnow()

# After (same replacement for both)
now = datetime.now(timezone.utc)
```

- [ ] **Step 3: Run backend tests to confirm no regression**

```bash
cd /Users/vasylbyk/projects/todo-app/backend
python -m pytest tests/test_endpoints.py -v 2>&1 | tail -20
```

Expected: `13 passed`.

- [ ] **Step 4: Commit**

```bash
cd /Users/vasylbyk/projects/todo-app
git add backend/main.py
git commit -m "fix: replace deprecated datetime.utcnow() with datetime.now(timezone.utc)"
```

---

### Task 3: Fix `datetime.utcnow` deprecation in `database.py`

**Files:**
- Modify: `backend/database.py:11,23-24`

SQLAlchemy column `default=` and `onupdate=` accept a callable. `datetime.utcnow` (bare, without calling it) was passed as that callable. Replace with `lambda: datetime.now(timezone.utc)`.

**Why lambda?** SQLAlchemy calls the callable at insert/update time. `datetime.utcnow` was the callable. `datetime.now(timezone.utc)` is a call expression (returns a value), so it must be wrapped in a lambda to remain a callable.

- [ ] **Step 1: Apply the fix**

Edit `backend/database.py`. The final file must look exactly like this:

```python
from sqlalchemy import (
    MetaData,
    Table,
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
)
from sqlalchemy.ext.asyncio import create_async_engine
from datetime import datetime, timezone
from settings import settings

engine = create_async_engine(settings.DATABASE_URL)
metadata = MetaData()

todos = Table(
    "todos",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("title", String, nullable=False),
    Column("completed", Boolean, default=False, nullable=False),
    Column("created_at", DateTime, default=lambda: datetime.now(timezone.utc), nullable=False),
    Column("updated_at", DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False),
    Column("type", String, default="todo", nullable=False),
)

async def create_db_and_tables():
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
```

Key changes:
- Line 11: `from datetime import datetime` → `from datetime import datetime, timezone`
- Line 23: `default=datetime.utcnow` → `default=lambda: datetime.now(timezone.utc)`
- Line 24: `default=datetime.utcnow` → `default=lambda: datetime.now(timezone.utc)`, `onupdate=datetime.utcnow` → `onupdate=lambda: datetime.now(timezone.utc)`

- [ ] **Step 2: Run backend tests to confirm no regression**

```bash
cd /Users/vasylbyk/projects/todo-app/backend
python -m pytest tests/test_endpoints.py -v 2>&1 | tail -20
```

Expected: `13 passed`.

- [ ] **Step 3: Commit**

```bash
cd /Users/vasylbyk/projects/todo-app
git add backend/database.py
git commit -m "fix: replace deprecated datetime.utcnow with lambda: datetime.now(timezone.utc) in SQLAlchemy defaults"
```

---

### Task 4: Fix `act(...)` warnings in `App.test.tsx`

**Files:**
- Modify: `frontend/src/App.test.tsx:1,60-65,78-82,91-96,106-112`

In React 18, state updates triggered by `fireEvent` calls that kick off async work (API calls → `setState`) must be wrapped in `act(async () => { ... })` to avoid the warning: `An update to App inside a test was not wrapped in act(...)`.

Four tests need fixing: `adds a todo`, `toggles todo completion`, `deletes a todo`, `shows error if addTodo fails`.

The `act` function is already exported from `@testing-library/react` — just add it to the existing import.

- [ ] **Step 1: Apply the fix**

Edit `frontend/src/App.test.tsx`. The final file must look exactly like this:

```tsx
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import App from './App';
import * as api from './services/api';
import { Todo } from './types/todo';
import '@testing-library/jest-dom';

// Mock API service
jest.mock('./services/api');

const mockTodos: Todo[] = [
  {
    id: 1,
    title: 'Test Todo',
    completed: false,
    created_at: '2024-08-31T12:00:00Z',
    updated_at: '2024-08-31T12:00:00Z',
    type: 'todo',
  },
];

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders loading state', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce(mockTodos);
    render(<App />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument());
  });

  test('renders todos after fetch', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce(mockTodos);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Test Todo')).toBeInTheDocument();
    });
  });

  test('shows error if fetchTodos fails', async () => {
    (api.getTodos as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch todos/i)).toBeInTheDocument();
    });
  });

  test('adds a todo', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce([]);
    (api.addTodo as jest.Mock).mockResolvedValueOnce({
      ...mockTodos[0],
      id: 2,
      title: 'New Todo',
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument());

    const input = screen.getByPlaceholderText(/Add a new task/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'New Todo' } });
      fireEvent.submit(input.closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText('New Todo')).toBeInTheDocument();
    });
  });

  test('toggles todo completion', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce(mockTodos);
    (api.updateTodo as jest.Mock).mockResolvedValueOnce({
      ...mockTodos[0],
      completed: true,
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Test Todo')).toBeInTheDocument());

    const checkbox = screen.getByRole('checkbox');
    await act(async () => {
      fireEvent.click(checkbox);
    });

    await waitFor(() => {
      expect(api.updateTodo).toHaveBeenCalled();
    });
  });

  test('deletes a todo', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce(mockTodos);
    (api.deleteTodo as jest.Mock).mockResolvedValueOnce(undefined);
    render(<App />);
    await waitFor(() => expect(screen.getByText('Test Todo')).toBeInTheDocument());

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    await waitFor(() => {
      expect(api.deleteTodo).toHaveBeenCalledWith(1);
      expect(screen.queryByText('Test Todo')).not.toBeInTheDocument();
    });
  });

  test('shows error if addTodo fails', async () => {
    (api.getTodos as jest.Mock).mockResolvedValueOnce([]);
    (api.addTodo as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument());

    const input = screen.getByPlaceholderText(/Add a new task/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Fail Todo' } });
      fireEvent.submit(input.closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to add todo/i)).toBeInTheDocument();
    });
  });
});
```

Key changes:
- Line 1: add `act` to the existing `@testing-library/react` import
- `adds a todo`: wrap `fireEvent.change` + `fireEvent.submit` in `await act(async () => { ... })`
- `toggles todo completion`: wrap `fireEvent.click(checkbox)` in `await act(async () => { ... })`
- `deletes a todo`: wrap `fireEvent.click(deleteButton)` in `await act(async () => { ... })`
- `shows error if addTodo fails`: wrap `fireEvent.change` + `fireEvent.submit` in `await act(async () => { ... })`

- [ ] **Step 2: Run frontend tests to confirm no regression and fewer warnings**

```bash
cd /Users/vasylbyk/projects/todo-app/frontend
CI=true npm test -- --watchAll=false 2>&1 | tail -30
```

Expected: all tests pass. The `not wrapped in act(...)` warnings for the four modified tests should be gone.

- [ ] **Step 3: Commit**

```bash
cd /Users/vasylbyk/projects/todo-app
git add frontend/src/App.test.tsx
git commit -m "fix: wrap fireEvent calls in act() to silence React 18 act() warnings"
```
