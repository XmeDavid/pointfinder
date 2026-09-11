"""Append-only version archive into Garage. No source or destination deletion.

The manifest is published only after every listed object version is copied and
download-verified. A scan is not a transactional snapshot across different keys.
Credentials are provided by callers, never logged. Production remains on Hetzner.
"""
import hashlib
import json
import tempfile
import uuid
from datetime import datetime, timezone
from botocore.exceptions import ClientError


def digest(stream):
    sha = hashlib.sha256()
    size = 0
    while True:
        chunk = stream.read(1024 * 1024)
        if not chunk:
            return sha.hexdigest(), size
        sha.update(chunk)
        size += len(chunk)


def snapshot(source, target, source_bucket, target_bucket='pointfinder-recovery', before_object=None):
    started = datetime.now(timezone.utc).isoformat()
    entries = []
    total = 0
    for page in source.get_paginator('list_object_versions').paginate(Bucket=source_bucket):
        for marker in page.get('DeleteMarkers', []):
            entries.append({'key': marker['Key'], 'version': marker['VersionId'],
                            'latest': marker['IsLatest'], 'deleted': True,
                            'modified': marker['LastModified'].isoformat()})
        for version in page.get('Versions', []):
            if before_object:
                before_object(version['Size'])
            key, version_id = version['Key'], version['VersionId']
            identity = hashlib.sha256(json.dumps([source_bucket, key, version_id],
                                                 ensure_ascii=True).encode()).hexdigest()
            archive_key = 'versions/' + source_bucket + '/' + identity
            try:
                head = target.head_object(Bucket=target_bucket, Key=archive_key)
            except ClientError as error:
                if error.response['ResponseMetadata']['HTTPStatusCode'] != 404:
                    raise
                head = None
            if head is None:
                obj = source.get_object(Bucket=source_bucket, Key=key, VersionId=version_id)
                with tempfile.TemporaryFile() as temporary:
                    sha = hashlib.sha256()
                    size = 0
                    with obj['Body'] as body:
                        while True:
                            chunk = body.read(1024 * 1024)
                            if not chunk:
                                break
                            temporary.write(chunk)
                            sha.update(chunk)
                            size += len(chunk)
                    assert size == version['Size'], 'Source size mismatch'
                    checksum = sha.hexdigest()
                    temporary.seek(0)
                    target.upload_fileobj(temporary, target_bucket, archive_key,
                        ExtraArgs={'Metadata': {'sha256': checksum},
                                   'ContentType': obj.get('ContentType', 'application/octet-stream')})
            else:
                checksum = head.get('Metadata', {}).get('sha256')
                assert checksum and head['ContentLength'] == version['Size'], 'Archive identity conflict'
            with target.get_object(Bucket=target_bucket, Key=archive_key)['Body'] as body:
                actual, size = digest(body)
            assert actual == checksum and size == version['Size'], 'Archive verification failed'
            total += size
            entries.append({'key': key, 'version': version_id, 'latest': version['IsLatest'],
                            'modified': version['LastModified'].isoformat(), 'deleted': False,
                            'archive_key': archive_key, 'sha256': checksum, 'size': size})
    manifest = {'format': 1, 'source_bucket': source_bucket, 'started': started,
                'completed': datetime.now(timezone.utc).isoformat(), 'entries': entries}
    body = json.dumps(manifest, sort_keys=True).encode()
    key = 'manifests/' + source_bucket + '/' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + str(uuid.uuid4()) + '.json'
    target.put_object(Bucket=target_bucket, Key=key, Body=body, ContentType='application/json')
    with target.get_object(Bucket=target_bucket, Key=key)['Body'] as stream:
        assert stream.read() == body, 'Manifest verification failed'
    return {'manifest': key, 'entries': len(entries), 'verified_bytes': total}


if __name__ == '__main__':
    import importlib.util
    from pathlib import Path
    from s3_storage import client, BUCKETS
    spec = importlib.util.spec_from_file_location('garage_probe', Path(__file__).with_name('verify-garage-recovery.py'))
    garage = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(garage)
    print(json.dumps(snapshot(client(), garage.client(), BUCKETS[0])), flush=True)
