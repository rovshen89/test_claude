# backend/app/config.py
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost/furniture_constructor"
    secret_key: str = Field(default="change-me-in-production", min_length=32)


settings = Settings()
