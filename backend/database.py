from typing import AsyncGenerator
from sqlalchemy import (
    MetaData,
    Table,
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    text,
)
from sqlalchemy.ext.asyncio import create_async_engine, AsyncConnection
from datetime import datetime, timezone
from settings import settings

engine = create_async_engine(settings.DATABASE_URL)
metadata = MetaData()

users = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("username", String, unique=True, nullable=False),
    Column("hashed_password", String, nullable=False),
    Column("created_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False),
)

todos = Table(
    "todos",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("title", String, nullable=False),
    Column("completed", Boolean, default=False, nullable=False),
    Column("created_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False),
    Column("updated_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False),
    Column("type", String, default="todo", nullable=False),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
)


async def get_db_conn() -> AsyncGenerator[AsyncConnection, None]:
    async with engine.connect() as connection:
        yield connection


async def create_db_and_tables():
    async with engine.begin() as conn:
        # create_all creates users first (no deps), then todos (depends on users)
        await conn.run_sync(metadata.create_all)
        # Add user_id to todos on existing DBs — safe no-op if column already exists
        await conn.execute(
            text("ALTER TABLE todos ADD COLUMN IF NOT EXISTS user_id INTEGER NOT NULL REFERENCES users(id)")
        )
