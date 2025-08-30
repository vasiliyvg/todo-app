from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from datetime import datetime

from models import Todo, TodoCreate, TodoUpdate

app = FastAPI(title="Todo API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage
todos_db: List[Todo] = []
next_id = 1

@app.get("/")
async def root():
    return {"message": "Todo API is running"}

@app.get("/todos", response_model=List[Todo])
async def get_todos():
    return todos_db

@app.get("/todos/{todo_id}", response_model=Todo)
async def get_todo(todo_id: int):
    todo = next((t for t in todos_db if t.id == todo_id), None)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo

@app.post("/todos", response_model=Todo)
async def create_todo(todo_create: TodoCreate):
    global next_id
    now = datetime.now()
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
async def update_todo(todo_id: int, todo_update: TodoUpdate):
    todo = next((t for t in todos_db if t.id == todo_id), None)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    update_data = todo_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(todo, field, value)
    
    todo.updated_at = datetime.now()
    return todo

@app.delete("/todos/{todo_id}")
async def delete_todo(todo_id: int):
    global todos_db
    todo = next((t for t in todos_db if t.id == todo_id), None)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    todos_db = [t for t in todos_db if t.id != todo_id]
    return {"message": "Todo deleted successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)