# backend/app/core/storage.py
import boto3

from app.config import settings


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.aws_region,
    )


def upload_bytes(key: str, data: bytes, content_type: str = "image/png") -> str:
    """Upload raw bytes to S3. Returns the key."""
    client = get_s3_client()
    client.put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    return key


def get_public_url(key: str) -> str:
    """Return the public URL for a stored object."""
    key = key.lstrip("/")
    if settings.s3_endpoint_url:
        base = settings.s3_endpoint_url.rstrip("/")
        return f"{base}/{settings.s3_bucket}/{key}"
    return f"https://{settings.s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}"
