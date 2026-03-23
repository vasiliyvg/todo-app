from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from typing import List
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncConnection

from models import Todo, TodoCreate, TodoUpdate, UserCreate, Token
from database import engine, todos, users, create_db_and_tables, get_db_conn
from auth import get_current_user, hash_password, verify_password, create_access_token


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_db_and_tables()
    yield


app = FastAPI(title="Todo API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Todo API is running"}


@app.post("/auth/register", response_model=Token, status_code=201)
async def register(user_create: UserCreate, conn: AsyncConnection = Depends(get_db_conn)):
    result = await conn.execute(users.select().where(users.c.username == user_create.username))
    if result.mappings().first():
        raise HTTPException(status_code=409, detail="Username already taken")
    hashed = hash_password(user_create.password)
    await conn.execute(users.insert().values(username=user_create.username, hashed_password=hashed))
    await conn.commit()
    return Token(access_token=create_access_token({"sub": user_create.username}))


@app.post("/auth/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends(), conn: AsyncConnection = Depends(get_db_conn)):
    result = await conn.execute(users.select().where(users.c.username == form.username))
    user = result.mappings().first()
    if not user or not verify_password(form.password, user["hashed_password"]):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token({"sub": user["username"]}))


@app.get("/todos", response_model=List[Todo])
async def get_todos(
    current_user=Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db_conn),
):
    result = await conn.execute(todos.select().where(todos.c.user_id == current_user["id"]))
    return result.mappings().all()


async def get_todo_by_id(todo_id: int, user_id: int, conn: AsyncConnection):
    result = await conn.execute(
        todos.select().where(todos.c.id == todo_id).where(todos.c.user_id == user_id)
    )
    todo = result.mappings().first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo


@app.get("/todos/{todo_id}", response_model=Todo)
async def get_todo(
    todo_id: int,
    current_user=Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db_conn),
):
    return await get_todo_by_id(todo_id, current_user["id"], conn)


@app.post("/todos", response_model=Todo, status_code=201)
async def create_todo(
    todo_create: TodoCreate,
    current_user=Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db_conn),
):
    now = datetime.now(timezone.utc)
    todo_type = todo_create.type if todo_create.type else "todo"
    query = todos.insert().values(
        title=todo_create.title,
        completed=False,
        created_at=now,
        updated_at=now,
        type=todo_type,
        user_id=current_user["id"],
    )
    result = await conn.execute(query)
    await conn.commit()
    new_id = result.inserted_primary_key[0]
    return await get_todo_by_id(new_id, current_user["id"], conn)


@app.put("/todos/{todo_id}", response_model=Todo)
async def update_todo(
    todo_id: int,
    todo_update: TodoUpdate,
    current_user=Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db_conn),
):
    now = datetime.now(timezone.utc)
    update_data = todo_update.model_dump(exclude_unset=True)
    update_data["updated_at"] = now
    query = todos.update().where(todos.c.id == todo_id).where(todos.c.user_id == current_user["id"]).values(**update_data)
    result = await conn.execute(query)
    await conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Todo not found")
    return await get_todo_by_id(todo_id, current_user["id"], conn)


@app.delete("/todos/{todo_id}", status_code=204)
async def delete_todo(
    todo_id: int,
    current_user=Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db_conn),
):
    query = todos.delete().where(todos.c.id == todo_id).where(todos.c.user_id == current_user["id"])
    result = await conn.execute(query)
    await conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Todo not found")
    return


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
