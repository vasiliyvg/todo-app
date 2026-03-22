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