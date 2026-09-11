"""Restore a saved-manifest object to an isolated synthetic key, then remove it."""
import hashlib
import importlib.util
import json
from pathlib import Path
import uuid

spec = importlib.util.spec_from_file_location('garage', Path(__file__).with_name('verify-garage-recovery.py'))
garage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(garage)
s3 = garage.client()
bucket = 'pointfinder-recovery'
manifest_key = 'manifests/pointfinder-prod-uploads-202609/20260909T223026Z-6e4140a5-887d-4b78-84ed-7f8ee0caedd5.json'
with s3.get_object(Bucket=bucket, Key=manifest_key)['Body'] as stream:
    manifest = json.load(stream)
assert manifest['format'] == 1
entry = next(e for e in manifest['entries'] if e['latest'] and not e['deleted'] and e['size'] > 0)
restored_key = '_verification/restore-' + str(uuid.uuid4())
try:
    s3.copy_object(Bucket=bucket, Key=restored_key,
                   CopySource={'Bucket': bucket, 'Key': entry['archive_key']})
    with s3.get_object(Bucket=bucket, Key=restored_key)['Body'] as stream:
        body = stream.read()
    assert len(body) == entry['size']
    assert hashlib.sha256(body).hexdigest() == entry['sha256']
    print('Saved-manifest object restore passed; restored bytes match original SHA-256.')
finally:
    s3.delete_object(Bucket=bucket, Key=restored_key)
