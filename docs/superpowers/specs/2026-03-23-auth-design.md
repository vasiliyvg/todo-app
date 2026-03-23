# Basic Authentication Design

**Date:** 2026-03-23

## Goal

Add JWT-based registration and login to the todo app. All `/todos` endpoints require a valid token. Todos are per-user — each user sees and manages only their own data.

## Context

- Backend: FastAPI + SQLAlchemy Core (async) + asyncpg + Postgres
- Frontend: React SPA using `fetch` for all API calls
- Currently no auth — all endpoints are public and todos are shared globally
- No migration tooling (Alembic); schema changes applied via `create_all` + manual `ALTER TABLE` statements in `create_db_and_tables()`

---

## Backend Changes

### New dependencies (`backend/requirements.txt`)

```
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
```

### `backend/settings.py`

Add two new fields:

```python
SECRET_KEY: str  # required — no default, must be set via env var or .env
ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
```

`SECRET_KEY` has no default so startup fails loudly if it is not configured. In `docker-compose.yml`, add `SECRET_KEY=dev-secret-key-change-in-production` to the backend environment.

### DB schema (`backend/database.py`)

**New `users` table:**

```python
users = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("username", String, unique=True, nullable=False),
    Column("hashed_password", String, nullable=False),
    Column("created_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False),
)
```

**`todos` table:** add `user_id` column:

```python
Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
```

### Migration strategy

`metadata.create_all` creates new tables but does not alter existing ones. `create_db_and_tables()` is extended to run:

```sql
ALTER TABLE todos ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
```

**Existing databases with data:** existing todos have no `user_id` and cannot be migrated automatically (no user to assign them to). Developers must reset the volume:

```bash
docker compose down -v
docker compose up
```

This is acceptable for a project at this stage.

### `backend/auth.py` (new file)

Single responsibility: password hashing and JWT sign/verify.

```
Functions:
  hash_password(plain: str) -> str
  verify_password(plain: str, hashed: str) -> bool
  create_access_token(data: dict) -> str   # signs JWT, sets exp
  decode_access_token(token: str) -> dict  # verifies + decodes, raises on invalid/expired

FastAPI dependency:
  get_current_user(token: str = Depends(oauth2_scheme), conn = Depends(get_db_conn)) -> UserRow
    - Decodes token, looks up user by username in DB
    - Raises HTTP 401 if token invalid, expired, or user not found
```

Uses `OAuth2PasswordBearer(tokenUrl="/auth/login")` for the `oauth2_scheme` dependency.

### `backend/models.py`

New Pydantic models:

```python
class UserCreate(BaseModel):
    username: str
    password: str

class UserPublic(BaseModel):
    id: int
    username: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

### New routes in `backend/main.py`

```
POST /auth/register
  Body: UserCreate
  - Check username not already taken (409 if duplicate)
  - Hash password, insert into users
  - Return Token

POST /auth/login
  Body: OAuth2PasswordRequestForm (username + password form fields)
  - Look up user by username (401 if not found)
  - Verify password hash (401 if mismatch)
  - Return Token
```

### Updated `/todos` endpoints

All five todo endpoints (`GET /todos`, `GET /todos/{id}`, `POST /todos`, `PUT /todos/{id}`, `DELETE /todos/{id}`) add:

```python
current_user = Depends(get_current_user)
```

Query changes:
- `GET /todos` — `WHERE user_id = current_user.id`
- `GET /todos/{id}` — `WHERE id = todo_id AND user_id = current_user.id`
- `POST /todos` — `INSERT ... user_id = current_user.id`
- `PUT /todos/{id}` — `WHERE id = todo_id AND user_id = current_user.id`
- `DELETE /todos/{id}` — `WHERE id = todo_id AND user_id = current_user.id`

For GET/PUT/DELETE by ID: if the todo doesn't exist **or** belongs to another user, return `404 Not Found` (no information leakage).

`GET /` health check remains public.

---

## Frontend Changes

### `frontend/src/services/auth.ts` (new file)

```typescript
export const register(username: string, password: string): Promise<string>  // returns token
export const login(username: string, password: string): Promise<string>      // returns token
```

Both call the backend and extract `access_token` from the response.

### `frontend/src/components/AuthForm.tsx` (new file)

Single form for both register and login with a mode toggle. Props:

```typescript
interface AuthFormProps {
  onAuth: (token: string) => void;
}
```

Shows username + password inputs. Submit calls `register` or `login` from `auth.ts`. On success, calls `onAuth(token)`. Shows inline error on failure.

### `frontend/src/services/api.ts`

All four functions (`getTodos`, `addTodo`, `updateTodo`, `deleteTodo`) gain a `token: string` parameter and pass `Authorization: Bearer <token>` in the request headers.

### `frontend/src/App.tsx`

- Add `const [token, setToken] = useState<string | null>(null)` state
- If `token` is null: render `<AuthForm onAuth={setToken} />`
- If `token` is set: render existing todo UI, pass `token` to all `api.*` calls
- Add a **Logout** button that calls `setToken(null)`

Token is in React state only (not `localStorage`). Page refresh requires re-login.

---

## Testing Strategy

### Backend

`backend/tests/test_auth.py` (new file) — tests for:
- `POST /auth/register` happy path and duplicate username
- `POST /auth/login` happy path and wrong password
- `GET /todos` returns 401 without token
- `GET /todos` returns only current user's todos (not another user's)

### Frontend

`frontend/src/components/AuthForm.test.tsx` (new file) — tests for:
- Renders login mode by default
- Switches to register mode on toggle
- Calls `onAuth` with token on successful login
- Shows error message on failed login

`frontend/src/services/api.test.ts` — update existing tests to pass a dummy token and verify `Authorization` header is included in requests.

---

## Docker Compose

Add to backend `environment`:

```yaml
- SECRET_KEY=dev-secret-key-change-in-production
```

---

## Files Changed

| File | Action | What changes |
|---|---|---|
| `backend/requirements.txt` | Modify | Add `python-jose[cryptography]`, `passlib[bcrypt]` |
| `backend/settings.py` | Modify | Add `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES` |
| `backend/database.py` | Modify | Add `users` table, `user_id` FK on `todos`, migration step |
| `backend/auth.py` | Create | Password hashing, JWT utilities, `get_current_user` dependency |
| `backend/models.py` | Modify | Add `UserCreate`, `UserPublic`, `Token` |
| `backend/main.py` | Modify | Add `/auth/register`, `/auth/login`; protect all `/todos` endpoints |
| `backend/tests/test_auth.py` | Create | Auth endpoint tests |
| `backend/tests/test_endpoints.py` | Modify | Update fixture to create user + obtain token before tests |
| `docker-compose.yml` | Modify | Add `SECRET_KEY` to backend environment |
| `frontend/src/services/auth.ts` | Create | `register` and `login` API functions |
| `frontend/src/components/AuthForm.tsx` | Create | Login/register form component |
| `frontend/src/services/api.ts` | Modify | Add `token` param, `Authorization` header to all calls |
| `frontend/src/App.tsx` | Modify | Auth state, conditional render, logout button |
| `frontend/src/components/AuthForm.test.tsx` | Create | AuthForm unit tests |
| `frontend/src/services/api.test.ts` | Modify | Update tests to verify Authorization header |
