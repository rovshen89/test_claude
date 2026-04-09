# backend/tests/test_storage.py
import boto3
import pytest
from moto import mock_aws

from app.config import settings
from app.core.storage import get_public_url, upload_bytes


@pytest.fixture
def _s3():
    """Start moto mock, create the bucket, yield the boto3 client."""
    with mock_aws():
        s3 = boto3.client(
            "s3",
            region_name="us-east-1",
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )
        s3.create_bucket(Bucket=settings.s3_bucket)
        yield s3


def test_upload_bytes_stores_object(_s3):
    key = "tenant/abc/materials/mat1/albedo.png"
    data = b"fake-png-bytes"
    result_key = upload_bytes(key, data)
    assert result_key == key
    obj = _s3.get_object(Bucket=settings.s3_bucket, Key=key)
    assert obj["Body"].read() == data


def test_upload_bytes_sets_content_type(_s3):
    key = "tenant/abc/materials/mat1/normal.png"
    upload_bytes(key, b"data", content_type="image/png")
    obj = _s3.head_object(Bucket=settings.s3_bucket, Key=key)
    assert obj["ContentType"] == "image/png"


def test_get_public_url_returns_s3_url():
    key = "tenant/abc/materials/mat1/albedo.png"
    url = get_public_url(key)
    assert key in url
    assert settings.s3_bucket in url
