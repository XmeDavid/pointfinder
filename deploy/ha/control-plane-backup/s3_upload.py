"""Optional off-host copy of one encrypted control-plane backup to the private
Hetzner backups bucket (``control-plane/`` prefix), so the existing hourly
Garage backup-recovery mirror picks the files up automatically.

Only ``upload_backup`` is public. It uploads the encrypted archive and its
secret-free manifest, then downloads the archive again and compares the
SHA-256 with the value the runner computed locally; success is reported only
when that round trip matches. It never lists, overwrites deliberately or
deletes anything: keys are unique per backup stamp and the bucket keeps
versions, so a repeated upload of the same name creates a new version rather
than destroying an old one.

Credentials come from a root-only JSON file::

    {"endpoint": "https://fsn1.your-objectstorage.com", "region": "fsn1",
     "access_key": "...", "secret_key": "..."}

The file content, the client and any exception text (which can embed signed
URLs or keys) are never logged or returned; callers see only outcomes.
"""
import hashlib
import json
import pathlib

OK = 'ok'
REQUIRED = ('endpoint', 'access_key', 'secret_key')


def load_credentials(path):
    with open(str(path)) as handle:
        values = json.load(handle)
    if not isinstance(values, dict) or any(not values.get(key) for key in REQUIRED):
        raise ValueError('credential file must contain endpoint, access_key and secret_key')
    return values


def make_client(values):
    import boto3
    from botocore.config import Config
    return boto3.client('s3', endpoint_url=values['endpoint'], region_name=values.get('region', 'fsn1'),
                        aws_access_key_id=values['access_key'], aws_secret_access_key=values['secret_key'],
                        config=Config(connect_timeout=10, read_timeout=120, retries={'max_attempts': 3},
                                      s3={'addressing_style': 'path'},
                                      request_checksum_calculation='when_required',
                                      response_checksum_validation='when_required'))


def object_key(prefix, name):
    prefix = prefix.strip('/')
    return (prefix + '/' if prefix else '') + name


def upload_backup(archive, manifest, credentials_file, bucket, prefix, expected_sha256, client=None):
    """Upload archive+manifest, verify the archive by GET, return an outcome dict.

    ``client`` may be injected for tests; it needs ``put_object`` and
    ``get_object`` only. Raises on any failure; the caller records only the
    exception class name.
    """
    archive = pathlib.Path(archive)
    manifest = pathlib.Path(manifest)
    if client is None:
        client = make_client(load_credentials(credentials_file))
    archive_key = object_key(prefix, archive.name)
    manifest_key = object_key(prefix, manifest.name)
    size = archive.stat().st_size
    with open(str(archive), 'rb') as handle:
        put = client.put_object(Bucket=bucket, Key=archive_key, Body=handle, ContentType='application/octet-stream')
    with open(str(manifest), 'rb') as handle:
        client.put_object(Bucket=bucket, Key=manifest_key, Body=handle, ContentType='application/json')
    fetched = client.get_object(Bucket=bucket, Key=archive_key)
    digest = hashlib.sha256()
    total = 0
    body = fetched['Body']
    for chunk in iter(lambda: body.read(1024 * 1024), b''):
        digest.update(chunk)
        total += len(chunk)
    actual = digest.hexdigest()
    if total != size or actual != expected_sha256:
        raise ValueError('remote archive does not match the local archive')
    return {'status': OK, 'bucket': bucket, 'key': archive_key, 'manifest_key': manifest_key,
            'bytes': total, 'sha256': actual, 'version_id': (put or {}).get('VersionId')}
