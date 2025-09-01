from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from datetime import datetime
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncConnection

from models import Todo, TodoCreate, TodoUpdate
from settings import settings
from database import engine, todos, create_db_and_tables

@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.STORAGE_TYPE == "postgres":
        await create_db_and_tables()
    yield

app = FastAPI(title="Todo API", version="1.0.0", lifespan=lifespan)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for "in_memory" mode
todos_db: List[Todo] = []
next_id = 1

async def get_db_conn() -> AsyncConnection:
    async with engine.connect() as connection:
        yield connection

@app.get("/")
async def root():
    return {"message": "Todo API is running"}

@app.get("/todos", response_model=List[Todo])
async def get_todos(conn: AsyncConnection = Depends(get_db_conn)):
    if settings.STORAGE_TYPE == "postgres":
        result = await conn.execute(todos.select())
        return result.mappings().all()
    else:
        return todos_db

async def get_todo_by_id(todo_id: int, conn: AsyncConnection):
    result = await conn.execute(todos.select().where(todos.c.id == todo_id))
    todo = result.mappings().first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo

@app.get("/todos/{todo_id}", response_model=Todo)
async def get_todo(todo_id: int, conn: AsyncConnection = Depends(get_db_conn)):
    if settings.STORAGE_TYPE == "postgres":
        return await get_todo_by_id(todo_id, conn)
    else:
        todo = next((t for t in todos_db if t.id == todo_id), None)
        if not todo:
            raise HTTPException(status_code=404, detail="Todo not found")
        return todo

@app.post("/todos", response_model=Todo, status_code=201)
async def create_todo(todo_create: TodoCreate, conn: AsyncConnection = Depends(get_db_conn)):
    now = datetime.utcnow()
    if settings.STORAGE_TYPE == "postgres":
        query = todos.insert().values(title=todo_create.title, completed=False, created_at=now, updated_at=now)
        result = await conn.execute(query)
        await conn.commit()
        new_id = result.inserted_primary_key[0]
        return await get_todo_by_id(new_id, conn)
    else:
        global next_id
        new_todo = Todo(
            id=next_id,
            title=todo_create.title,
            completed=False,
            created_at=now,
            updated_at=now
        )
        todos_db.append(new_todo)
        next_id += 1
        return new_todo

@app.put("/todos/{todo_id}", response_model=Todo)
async def update_todo(todo_id: int, todo_update: TodoUpdate, conn: AsyncConnection = Depends(get_db_conn)):
    now = datetime.utcnow()
    if settings.STORAGE_TYPE == "postgres":
        update_data = todo_update.model_dump(exclude_unset=True)
        update_data["updated_at"] = now
        query = todos.update().where(todos.c.id == todo_id).values(**update_data)
        result = await conn.execute(query)
        await conn.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Todo not found")
        return await get_todo_by_id(todo_id, conn)
    else:
        todo = next((t for t in todos_db if t.id == todo_id), None)
        if not todo:
            raise HTTPException(status_code=404, detail="Todo not found")
        
        update_data = todo_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(todo, field, value)
        
        todo.updated_at = now
        return todo

@app.delete("/todos/{todo_id}", status_code=204)
async def delete_todo(todo_id: int, conn: AsyncConnection = Depends(get_db_conn)):
    if settings.STORAGE_TYPE == "postgres":
        query = todos.delete().where(todos.c.id == todo_id)
        result = await conn.execute(query)
        await conn.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Todo not found")
    else:
        global todos_db
        todo = next((t for t in todos_db if t.id == todo_id), None)
        if not todo:
            raise HTTPException(status_code=404, detail="Todo not found")
        todos_db = [t for t in todos_db if t.id != todo_id]
    return

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
