"""Run on Hetzner; S3 credentials arrive as JSON on stdin, never persisted.

Copies non-internal legacy upload files without deleting or changing source data.
Existing objects are verified byte-for-byte instead of overwritten.
"""
import hashlib
import json
import mimetypes
import pathlib
import sys
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

ROOT = pathlib.Path('/mnt/HC_Volume_104744479/uploads')
BUCKET = 'pointfinder-prod-uploads-202609'


def digest(stream):
    value = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        value.update(chunk)
    return value.hexdigest()


def main():
    credentials = json.load(sys.stdin)
    s3 = boto3.client('s3', endpoint_url='https://fsn1.your-objectstorage.com',
                      region_name='fsn1',
                      aws_access_key_id=credentials['HETZNER_S3_ACCESS_KEY'],
                      aws_secret_access_key=credentials['HETZNER_S3_SECRET_KEY'],
                      config=Config(request_checksum_calculation='when_required',
                                    response_checksum_validation='when_required'))
    assert s3.get_bucket_versioning(Bucket=BUCKET)['Status'] == 'Enabled'
    files = sorted(p for p in ROOT.rglob('*') if p.is_file()
                   and not p.relative_to(ROOT).parts[0].startswith('_'))
    copied = verified = total = 0
    for file in files:
        assert not file.is_symlink() and file.resolve().is_relative_to(ROOT.resolve())
        before = file.stat()
        key = file.relative_to(ROOT).as_posix()
        with file.open('rb') as stream:
            sha = digest(stream)
        try:
            s3.head_object(Bucket=BUCKET, Key=key)
        except ClientError as error:
            if error.response['ResponseMetadata']['HTTPStatusCode'] != 404:
                raise
            s3.upload_file(str(file), BUCKET, key,
                           ExtraArgs={'ContentType': mimetypes.guess_type(file.name)[0]
                                      or 'application/octet-stream',
                                      'Metadata': {'sha256': sha}})
            copied += 1
        with s3.get_object(Bucket=BUCKET, Key=key)['Body'] as stream:
            assert digest(stream) == sha, 'Remote content mismatch; no overwrite performed'
        after = file.stat()
        assert (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns), 'Source changed during copy'
        verified += 1
        total += before.st_size
        if verified % 25 == 0:
            print(json.dumps({'verified': verified, 'copied': copied, 'bytes': total}), flush=True)
    print(json.dumps({'complete': True, 'verified': verified, 'copied': copied,
                      'bytes': total, 'source_deleted': False}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except ClientError as error:
        raise SystemExit('S3 error: ' + error.response['Error']['Code']) from None
