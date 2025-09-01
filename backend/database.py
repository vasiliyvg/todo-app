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
from datetime import datetime
from .settings import settings

engine = create_async_engine(settings.DATABASE_URL)
metadata = MetaData()

todos = Table(
    "todos",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("title", String, nullable=False),
    Column("completed", Boolean, default=False, nullable=False),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
    Column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False),
)

async def create_db_and_tables():
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
