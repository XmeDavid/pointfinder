"""Narrow S3 provisioning/verification. Credentials never leave process memory."""
import argparse
import json
import pathlib
import uuid

import boto3
from botocore import UNSIGNED
from botocore.config import Config
from botocore.exceptions import ClientError

ENDPOINT = 'https://fsn1.your-objectstorage.com'
BUCKETS = ('pointfinder-prod-uploads-202609', 'pointfinder-prod-backups-202609')


def client():
    values = {}
    for line in pathlib.Path('/Users/xmedavid/.env').read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep and key.strip() in {'HETZNER_S3_ACCESS_KEY', 'HETZNER_S3_SECRET_KEY'}:
            values[key.strip()] = value.strip().strip('\"\'')
    return boto3.client('s3', endpoint_url=ENDPOINT, region_name='fsn1',
                        aws_access_key_id=values['HETZNER_S3_ACCESS_KEY'],
                        aws_secret_access_key=values['HETZNER_S3_SECRET_KEY'],
                        config=Config(request_checksum_calculation='when_required',
                                      response_checksum_validation='when_required'))


def verify(s3, bucket):
    assert s3.get_bucket_versioning(Bucket=bucket).get('Status') == 'Enabled'
    grants = s3.get_bucket_acl(Bucket=bucket)['Grants']
    assert not any(g['Grantee'].get('Type') == 'Group' for g in grants)
    try:
        s3.get_bucket_policy(Bucket=bucket)
    except ClientError as error:
        assert error.response['Error']['Code'] == 'NoSuchBucketPolicy'
    else:
        raise RuntimeError('Unexpected bucket policy; review before testing')
    anonymous = boto3.client('s3', endpoint_url=ENDPOINT, region_name='fsn1',
                             config=Config(signature_version=UNSIGNED))
    key = '_verification/' + str(uuid.uuid4())
    versions = []
    try:
        for body in (b'pointfinder-storage-probe-v1', b'pointfinder-storage-probe-v2'):
            result = s3.put_object(Bucket=bucket, Key=key, Body=body)
            version = result['VersionId']
            versions.append(version)
            with s3.get_object(Bucket=bucket, Key=key, VersionId=version)['Body'] as stream:
                assert stream.read() == body
        assert versions[0] != versions[1]
        with s3.get_object(Bucket=bucket, Key=key, VersionId=versions[0])['Body'] as stream:
            assert stream.read() == b'pointfinder-storage-probe-v1'
        for action, args in ((anonymous.get_object, {'Key': key}),
                             (anonymous.list_objects_v2, {})):
            try:
                action(Bucket=bucket, **args)
            except ClientError as error:
                assert error.response['ResponseMetadata']['HTTPStatusCode'] == 403
            else:
                raise RuntimeError('Anonymous access unexpectedly permitted')
        print(json.dumps({'bucket': bucket, 'versioning': 'Enabled',
                          'write_read_old_version': 'passed', 'anonymous_access': 'denied'}), flush=True)
    finally:
        # Delete only synthetic versions created by this invocation, never user data.
        for version in versions:
            s3.delete_object(Bucket=bucket, Key=key, VersionId=version)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['inventory', 'provision', 'verify'])
    args = parser.parse_args()
    s3 = client()
    existing = {b['Name'] for b in s3.list_buckets()['Buckets']}
    print(json.dumps({'existing_buckets': sorted(existing)}), flush=True)
    if args.action == 'inventory':
        return
    if args.action == 'provision':
        if existing.intersection(BUCKETS):
            raise RuntimeError('Target already exists; reconcile rather than reprovision')
        for bucket in BUCKETS:
            s3.create_bucket(Bucket=bucket, ACL='private',
                             CreateBucketConfiguration={'LocationConstraint': 'fsn1'})
            print(json.dumps({'created_bucket': bucket}), flush=True)
            s3.get_waiter('bucket_exists').wait(Bucket=bucket,
                                               WaiterConfig={'Delay': 2, 'MaxAttempts': 20})
            s3.put_bucket_versioning(Bucket=bucket, VersioningConfiguration={'Status': 'Enabled'})
            verify(s3, bucket)
    else:
        for bucket in BUCKETS:
            verify(s3, bucket)


if __name__ == '__main__':
    try:
        main()
    except ClientError as error:
        raise SystemExit('S3 request failed: ' + error.response['Error']['Code']) from None
