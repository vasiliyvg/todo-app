# Test Coverage Design — Todo App

**Date:** 2026-03-22
**Goal:** Achieve ~80% unit test coverage across frontend (React/TypeScript) and backend (FastAPI/Python).
**Approach:** Add dedicated test files per module (Option A — fill gaps file by file). No production code changes.

---

## Scope

### In scope
- Frontend: `TodoItem`, `TodoList`, `TodoForm`, `Timeline` components and `api.ts` service
- Backend: all 5 FastAPI endpoints in `main.py`

### Out of scope
- Fixing the known Timeline rendering bug (tests cover current behavior only)
- Integration or end-to-end tests
- `database.py` and `settings.py` (thin wrappers around SQLAlchemy/pydantic-settings internals)
- `App.tsx` (already covered by existing integration-style tests in `App.test.tsx`)
- `models.py` (already covered in `test_main.py`)

---

## Frontend

**Tech:** Jest + React Testing Library (already configured via react-scripts)
**Mocking:** `jest.fn()` for callbacks; `global.fetch` mock for `api.ts`

### `src/components/TodoItem.test.tsx`
- Renders todo item text
- Renders checkbox as unchecked when `completed: false`
- Renders checkbox as checked when `completed: true`
- Applies line-through style when completed
- Calls `toggleComplete` with the correct todo id on checkbox click
- Calls `deleteTodo` with the correct todo id on delete button click

### `src/components/TodoList.test.tsx`
- Renders the correct number of `TodoItem` components
- Renders nothing (empty list) when `todos` is an empty array
- Passes `toggleComplete` and `deleteTodo` callbacks to each item

### `src/components/TodoForm.test.tsx`
- Renders a text input and a type selector
- Calls `addTodo` with the entered text and selected type on submit
- Clears the text input after successful submission
- Does not call `addTodo` when the text input is empty

### `src/components/Timeline.test.tsx`
- Renders without crashing with an empty todos array
- Renders the correct number of timeline entries for todos of type `"timeline"`
- Renders todo titles in the timeline

### `src/services/api.test.ts`
- `getTodos()` — calls `GET /todos`, returns parsed JSON
- `addTodo(text, type)` — calls `POST /todos` with correct body and headers, returns created todo
- `updateTodo(id, fields)` — calls `PUT /todos/{id}` with correct body, returns updated todo
- `deleteTodo(id)` — calls `DELETE /todos/{id}`
- Each function: rejects on non-ok HTTP response

---

## Backend

**Tech:** pytest + FastAPI `TestClient`
**Storage:** `STORAGE_TYPE=memory` (in-memory, no database required)

### `backend/tests/test_endpoints.py`

#### Health check
- `GET /` returns 200

#### `GET /todos`
- Returns empty list initially
- Returns list of todos after one is created

#### `POST /todos`
- Creates a todo with default type `"todo"`
- Creates a todo with explicit type `"timeline"`
- Returns 422 for missing `title` field

#### `GET /todos/{id}`
- Returns the correct todo by id
- Returns 404 for an unknown id

#### `PUT /todos/{id}`
- Updates `completed` status
- Updates `title`
- Returns 404 for an unknown id

#### `DELETE /todos/{id}`
- Deletes the todo successfully
- Returns 404 for an unknown id

---

## File Summary

| New file | Tests |
|---|---|
| `frontend/src/components/TodoItem.test.tsx` | 6 |
| `frontend/src/components/TodoList.test.tsx` | 3 |
| `frontend/src/components/TodoForm.test.tsx` | 4 |
| `frontend/src/components/Timeline.test.tsx` | 3 |
| `frontend/src/services/api.test.ts` | 9 |
| `backend/tests/test_endpoints.py` | 13 |

**Total new tests: ~38**
**Estimated coverage after implementation: ~80%+**
