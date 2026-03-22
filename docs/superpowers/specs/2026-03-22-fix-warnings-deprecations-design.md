# Fix Warnings and Deprecations Design

**Date:** 2026-03-22
**Branch:** fix-warnings-deprecations

## Scope

Fix all warnings and deprecations in our own source code. No library upgrades. No production behavior changes.

## Changes

### `backend/models.py`

Replace deprecated Pydantic V2 inner `class Config` with `model_config`:

Two changes in this file:

**1. `@field_validator` missing `@classmethod`** — Pydantic V2 requires validators to be explicit classmethods:

```python
# Before
@field_validator('title')
def title_must_not_be_empty(cls, v):

# After
@field_validator('title')
@classmethod
def title_must_not_be_empty(cls, v):
```

**2. `class Config` → `model_config`**

Add `ConfigDict` to the existing pydantic import on line 1 (replace, don't add a second import line):

```python
# Line 1 after change
from pydantic import BaseModel, field_validator, ConfigDict
```

Replace the inner class on the `Todo` model:

```python
# Before
class Config:
    from_attributes = True

# After (class-level attribute, no inner class)
model_config = ConfigDict(from_attributes=True)
```

### `backend/main.py`

Replace deprecated `datetime.utcnow()` (lines 69, 93) with timezone-aware equivalent:

```python
# Before
from datetime import datetime
now = datetime.utcnow()

# After
from datetime import datetime, timezone
now = datetime.now(timezone.utc)
```

### `backend/database.py`

Replace deprecated bare `datetime.utcnow` function references used as SQLAlchemy column defaults (lines 23–24):

```python
# Before
from datetime import datetime
Column("created_at", DateTime, default=datetime.utcnow, ...)
Column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, ...)

# After
from datetime import datetime, timezone
Column("created_at", DateTime, default=lambda: datetime.now(timezone.utc), ...)
Column("updated_at", DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), ...)
```

### `frontend/src/App.test.tsx`

Wrap `fireEvent` calls that trigger async state updates in `act(async () => { ... })`. Affected tests: `adds a todo`, `toggles todo completion`, `deletes a todo`, `shows error if addTodo fails`.

`act` is already exported by `@testing-library/react` — add to existing import.

Multi-event example (`adds a todo`, `shows error if addTodo fails`):

```tsx
// Before
fireEvent.change(input, { target: { value: 'New Todo' } });
fireEvent.submit(input.closest('form')!);
await waitFor(() => { ... });

// After
await act(async () => {
  fireEvent.change(input, { target: { value: 'New Todo' } });
  fireEvent.submit(input.closest('form')!);
});
await waitFor(() => { ... });
```

Single-event example (`toggles todo completion`, `deletes a todo`):

```tsx
// Before
fireEvent.click(checkbox);
await waitFor(() => { ... });

// After
await act(async () => {
  fireEvent.click(checkbox);
});
await waitFor(() => { ... });
```

## File Summary

| File | Change |
|---|---|
| `backend/models.py` | `class Config` → `model_config = ConfigDict(...)` |
| `backend/main.py` | `datetime.utcnow()` → `datetime.now(timezone.utc)` (×2) |
| `backend/database.py` | `datetime.utcnow` → `lambda: datetime.now(timezone.utc)` (×3) |
| `frontend/src/App.test.tsx` | Wrap `fireEvent` blocks in `act(async () => { ... })` (×4 tests) |
