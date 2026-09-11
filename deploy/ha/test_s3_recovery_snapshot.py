import importlib.util
import io
from pathlib import Path
import unittest
from datetime import datetime, timezone
from botocore.exceptions import ClientError

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).with_name('s3-recovery-snapshot.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Source:
    def get_paginator(self, name):
        return self
    def paginate(self, **kwargs):
        yield {'Versions': [{'Key': 'media', 'VersionId': 'v1', 'Size': 3,
                             'IsLatest': False, 'LastModified': datetime.now(timezone.utc)}]}
        yield {'DeleteMarkers': [{'Key': 'media', 'VersionId': 'v2',
                                  'IsLatest': True, 'LastModified': datetime.now(timezone.utc)}]}
    def get_object(self, **kwargs):
        return {'Body': io.BytesIO(b'abc')}

class Target:
    def __init__(self):
        self.objects = {}
        self.metadata = {}
        self.corrupt = False
    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({'ResponseMetadata': {'HTTPStatusCode': 404},
                               'Error': {'Code': 'NoSuchKey'}}, 'HeadObject')
        return {'ContentLength': len(self.objects[Key]), 'Metadata': self.metadata[Key]}
    def upload_fileobj(self, stream, bucket, key, ExtraArgs):
        self.objects[key] = stream.read()
        self.metadata[key] = ExtraArgs['Metadata']
    def get_object(self, Bucket, Key):
        return {'Body': io.BytesIO(b'bad' if self.corrupt else self.objects[Key])}
    def put_object(self, Bucket, Key, Body, **kwargs):
        self.objects[Key] = Body

class SnapshotTests(unittest.TestCase):
    def test_versions_and_markers_preserved(self):
        target = Target()
        result = module.snapshot(Source(), target, 'uploads')
        self.assertEqual(result['entries'], 2)
        self.assertEqual(result['verified_bytes'], 3)
        self.assertEqual(len(target.objects), 2)
    def test_rerun_reuses_archived_version(self):
        target = Target()
        module.snapshot(Source(), target, 'uploads')
        module.snapshot(Source(), target, 'uploads')
        self.assertEqual(sum(k.startswith('versions/') for k in target.objects), 1)
    def test_corruption_prevents_complete_manifest(self):
        target = Target()
        target.corrupt = True
        with self.assertRaises(AssertionError):
            module.snapshot(Source(), target, 'uploads')
        self.assertFalse(any(k.startswith('manifests/') for k in target.objects))

if __name__ == '__main__':
    unittest.main()
