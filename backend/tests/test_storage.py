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
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.aws_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
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


def test_get_public_url_real_aws_format(monkeypatch):
    monkeypatch.setattr(settings, "s3_endpoint_url", None)
    monkeypatch.setattr(settings, "s3_bucket", "my-bucket")
    monkeypatch.setattr(settings, "aws_region", "eu-west-1")
    url = get_public_url("materials/abc/albedo.png")
    assert url == "https://my-bucket.s3.eu-west-1.amazonaws.com/materials/abc/albedo.png"


def test_get_public_url_custom_endpoint_format(monkeypatch):
    monkeypatch.setattr(settings, "s3_endpoint_url", "http://localhost:9000")
    monkeypatch.setattr(settings, "s3_bucket", "my-bucket")
    url = get_public_url("materials/abc/albedo.png")
    assert url == "http://localhost:9000/my-bucket/materials/abc/albedo.png"


def test_get_public_url_strips_leading_slash(monkeypatch):
    monkeypatch.setattr(settings, "s3_endpoint_url", None)
    monkeypatch.setattr(settings, "s3_bucket", "my-bucket")
    monkeypatch.setattr(settings, "aws_region", "us-east-1")
    url = get_public_url("/materials/abc/albedo.png")  # leading slash
    assert url == "https://my-bucket.s3.us-east-1.amazonaws.com/materials/abc/albedo.png"
