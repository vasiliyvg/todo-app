# Basic Authentication Design

**Date:** 2026-03-23

## Goal

Add JWT-based registration and login to the todo app. All `/todos` endpoints require a valid token. Todos are per-user — each user sees and manages only their own data.

## Context

- Backend: FastAPI + SQLAlchemy Core (async) + asyncpg + Postgres
- Frontend: React SPA using `fetch` for all API calls
- Currently no auth — all endpoints are public and todos are shared globally
- No migration tooling (Alembic); schema changes applied via `create_all` + explicit `ALTER TABLE` in `create_db_and_tables()`

---

## Backend Changes

### New dependencies (`backend/requirements.txt`)

```
PyJWT==2.8.0
passlib[bcrypt]==1.7.4
```

`PyJWT` replaces `python-jose` (unmaintained since 2022, CVE-2024-33663). `PyJWT` is actively maintained and the current community standard.

### `backend/settings.py`

Add two new fields:

```python
SECRET_KEY: str  # required — no default, startup fails loudly if unset
ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
```

In `docker-compose.yml`, add `SECRET_KEY=dev-secret-key-change-in-production` to the backend environment.

### `backend/database.py`

**Move `get_db_conn` here** (currently in `main.py`). This avoids a circular import: `auth.py` needs `get_db_conn`, and `main.py` imports from `auth.py`.

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

`metadata.create_all` creates new tables but does not alter existing ones. After `create_all` runs (which guarantees `users` exists), `create_db_and_tables()` executes:

```sql
ALTER TABLE todos ADD COLUMN IF NOT EXISTS user_id INTEGER NOT NULL REFERENCES users(id);
```

The `NOT NULL` constraint matches the column definition. This statement is safe to run on a fresh DB (column doesn't exist yet) and a no-op via `IF NOT EXISTS` on a DB where the column is already present.

**Existing databases with data:** todos with no `user_id` cannot be migrated (no user to assign them to). The `NOT NULL` constraint would reject the `ALTER TABLE` if any rows exist. Developers must reset the volume:

```bash
docker compose down -v && docker compose up
```

This is acceptable for a project at this stage.

### `backend/auth.py` (new file)

Single responsibility: password hashing and JWT sign/verify. Imports `get_db_conn` from `database.py` (not `main.py`).

```
Functions:
  hash_password(plain: str) -> str
  verify_password(plain: str, hashed: str) -> bool
  create_access_token(data: dict) -> str
    - Signs JWT with HS256 algorithm, sets `exp` claim
  decode_access_token(token: str) -> dict
    - Decodes and verifies JWT with algorithms=["HS256"] pinned
    - Raises HTTP 401 on invalid signature, wrong algorithm, or expired token

FastAPI dependency:
  get_current_user(token: str = Depends(oauth2_scheme), conn = Depends(get_db_conn)) -> UserRow
    - Calls decode_access_token, extracts `sub` (username)
    - Looks up user in DB by username
    - Raises HTTP 401 if token invalid/expired or user not found
```

Algorithm is pinned to `HS256` in both sign and verify to prevent algorithm confusion attacks (`alg: none`).

Uses `OAuth2PasswordBearer(tokenUrl="/auth/login")` for the `oauth2_scheme` dependency.

### `backend/models.py`

New Pydantic models:

```python
class UserCreate(BaseModel):
    username: str
    password: str

    @field_validator('password')
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        return v

class UserPublic(BaseModel):
    id: int
    username: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

### New routes in `backend/main.py`

`get_db_conn` import moves from definition here to `from database import get_db_conn`.

```
POST /auth/register
  Body: UserCreate (JSON)
  - Validate: password >= 8 chars (Pydantic validator)
  - Check username not already taken (409 Conflict if duplicate)
  - hash_password, insert into users
  - Return Token

POST /auth/login
  Body: OAuth2PasswordRequestForm (username + password form fields)
  - Look up user by username (401 if not found)
  - verify_password (401 if mismatch)
  - Return Token
```

### Updated `/todos` endpoints

All five todo endpoints add `current_user = Depends(get_current_user)`. Query changes:

- `GET /todos` — `WHERE user_id = current_user.id`
- `GET /todos/{id}` — `WHERE id = todo_id AND user_id = current_user.id`
- `POST /todos` — `INSERT ... user_id = current_user.id`
- `PUT /todos/{id}` — `WHERE id = todo_id AND user_id = current_user.id`
- `DELETE /todos/{id}` — `WHERE id = todo_id AND user_id = current_user.id`

For GET/PUT/DELETE by ID: if the todo doesn't exist **or** belongs to another user → `404 Not Found` (no information leakage).

`GET /` health check remains public.

---

## Frontend Changes

### `frontend/src/services/auth.ts` (new file)

```typescript
export const register(username: string, password: string): Promise<string>  // returns token
export const login(username: string, password: string): Promise<string>      // returns token
```

Both POST to `/auth/register` and `/auth/login` respectively and extract `access_token` from the JSON response.

### `frontend/src/components/AuthForm.tsx` (new file)

Single form handling both register and login, toggled by a "Switch to Register / Switch to Login" link. Props:

```typescript
interface AuthFormProps {
  onAuth: (token: string) => void;
}
```

Shows username + password inputs. On submit calls `register` or `login` from `auth.ts`. On success calls `onAuth(token)`. Shows inline error message on failure.

### `frontend/src/services/api.ts`

All four functions gain a `token: string` parameter and an optional `onUnauthorized?: () => void` callback. They pass `Authorization: Bearer <token>` in request headers. On a 401 response, `onUnauthorized?.()` is called before throwing. Example signature:

```typescript
export const getTodos = async (token: string, onUnauthorized?: () => void): Promise<Todo[]>
```

All four functions follow this same signature shape.

### `frontend/src/App.tsx`

- Add `const [token, setToken] = useState<string | null>(null)` state
- If `token` is null → render `<AuthForm onAuth={setToken} />`
- If `token` is set → render existing todo UI, pass `token` to all `api.*` calls
- Add a **Logout** button that calls `setToken(null)`
- **401 mid-session handling:** all `api.*` calls that receive a 401 response throw an error; the existing `catch` blocks in `App.tsx` set the error state. Additionally, on a 401 response, `setToken(null)` is called to return the user to the login screen. The `api.ts` functions accept an optional `onUnauthorized` callback for this purpose, called before throwing when response status is 401.

Token stored in React state only (not `localStorage`). Page refresh requires re-login.

---

## Testing Strategy

### Backend

`backend/tests/test_auth.py` (new file) — tests for:
- `POST /auth/register` happy path (returns token)
- `POST /auth/register` duplicate username → 409
- `POST /auth/register` short password → 422
- `POST /auth/login` happy path (returns token)
- `POST /auth/login` wrong password → 401
- `GET /todos` without token → 401
- `GET /todos` with token returns only the current user's todos (not another user's)

`backend/tests/test_endpoints.py` — update `reset_state` fixture to truncate both tables with CASCADE (FK-safe):

```python
await conn.execute(text("TRUNCATE TABLE todos, users RESTART IDENTITY CASCADE"))
```

Also add a `user_token` fixture that registers a test user and returns a token. The module-level `client` becomes a function-scoped `client` fixture that constructs `TestClient` with the token pre-set:

```python
@pytest.fixture
def client(user_token):
    return TestClient(app, headers={"Authorization": f"Bearer {user_token}"})
```

All existing test methods receive `client` as a parameter instead of using the module-level variable.

### Frontend

`frontend/src/components/AuthForm.test.tsx` (new file) — tests for:
- Renders login mode by default
- Toggles to register mode
- Calls `onAuth` with token on successful login
- Shows error message on failed login

`frontend/src/services/api.test.ts` — update existing tests to pass a dummy token and verify `Authorization: Bearer <token>` header is sent.

`frontend/src/App.test.tsx` — update existing mocks: `api.getTodos` etc. now take a `token` parameter; update mock signatures accordingly.

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
| `backend/requirements.txt` | Modify | Add `PyJWT`, `passlib[bcrypt]` |
| `backend/settings.py` | Modify | Add `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES` |
| `backend/database.py` | Modify | Move `get_db_conn` here; add `users` table, `user_id` FK on `todos`, migration step |
| `backend/auth.py` | Create | Password hashing, JWT (HS256 pinned), `get_current_user` dependency |
| `backend/models.py` | Modify | Add `UserCreate` (with password validator), `UserPublic`, `Token` |
| `backend/main.py` | Modify | Add `/auth/register`, `/auth/login`; protect all `/todos` endpoints; import `get_db_conn` from `database` |
| `backend/tests/test_auth.py` | Create | Auth endpoint tests |
| `backend/tests/test_endpoints.py` | Modify | Update `reset_state` to truncate users CASCADE; add `user_token` fixture |
| `docker-compose.yml` | Modify | Add `SECRET_KEY` to backend environment |
| `frontend/src/services/auth.ts` | Create | `register` and `login` API functions |
| `frontend/src/components/AuthForm.tsx` | Create | Login/register form component |
| `frontend/src/services/api.ts` | Modify | Add `token` param + `Authorization` header; `onUnauthorized` callback on 401 |
| `frontend/src/App.tsx` | Modify | Auth state, conditional render, logout, 401 → re-login handling |
| `frontend/src/components/AuthForm.test.tsx` | Create | AuthForm unit tests |
| `frontend/src/services/api.test.ts` | Modify | Verify Authorization header in all API call tests |
| `frontend/src/App.test.tsx` | Modify | Update mock signatures for token parameter |
