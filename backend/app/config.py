# backend/app/config.py
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost/furniture_constructor"
    secret_key: str = Field(default="change-me-in-production-replace-this-key", min_length=32)

    # S3-compatible storage — override all via env vars in production
    # s3_access_key / s3_secret_key defaults work only with moto mocks
    s3_bucket: str = "furniture-constructor"
    s3_access_key: str = "test"
    s3_secret_key: str = "test"
    s3_endpoint_url: Optional[str] = None  # None = real AWS; set for MinIO/localstack
    aws_region: str = "us-east-1"


settings = Settings()
