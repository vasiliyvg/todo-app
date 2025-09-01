from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8')

    STORAGE_TYPE: str = "in_memory"
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost/tododb"

settings = Settings()
