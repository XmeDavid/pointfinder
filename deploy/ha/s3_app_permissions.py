"""Scope the Dokploy application S3 key on the two known PointFinder buckets.

No secrets or rendered policies may be printed: principal ARNs contain access keys.
New buckets in the same Hetzner project require their own policies.
"""
import json
import uuid
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from dokploy_api import call
from s3_storage import client, BUCKETS, ENDPOINT


def main():
    values = {}
    project = call('GET', 'project.one?projectId=o6PE4lw9B-qhAcd_8jVo6')
    for line in (project.get('env') or '').splitlines():
        key, sep, value = line.partition('=')
        if sep and key.strip() in {'POINTFINDER_S3_ACCESS_KEY', 'POINTFINDER_S3_SECRET_KEY'}:
            values[key.strip()] = value.strip().strip('\"\'')
    admin = client()
    app_key = values['POINTFINDER_S3_ACCESS_KEY']
    # A distinct key is essential to preserve independent administrator recovery.
    assert app_key != admin._request_signer._credentials.access_key
    app = boto3.client('s3', endpoint_url=ENDPOINT, region_name='fsn1',
                       aws_access_key_id=app_key,
                       aws_secret_access_key=values['POINTFINDER_S3_SECRET_KEY'],
                       config=Config(request_checksum_calculation='when_required',
                                     response_checksum_validation='when_required'))
    app.head_bucket(Bucket=BUCKETS[0])
    existing = {b['Name'] for b in admin.list_buckets()['Buckets']}
    assert existing == set(BUCKETS), 'Additional buckets require access review'
    owner = admin.get_bucket_acl(Bucket=BUCKETS[0])['Owner']['ID']
    assert owner.startswith('p') and owner[1:].isdigit()
    principal = {'AWS': 'arn:aws:iam:::user/' + owner + ':' + app_key}
    admin_actions = [
        's3:PutBucketPolicy', 's3:DeleteBucketPolicy', 's3:GetBucketPolicy',
        's3:PutBucketAcl', 's3:PutBucketVersioning', 's3:PutLifecycleConfiguration',
        's3:PutBucketCORS', 's3:DeleteBucket', 's3:DeleteObjectVersion',
        's3:PutObjectAcl', 's3:PutObjectVersionAcl',
        's3:PutBucketObjectLockConfiguration', 's3:PutObjectRetention',
        's3:PutObjectLegalHold', 's3:BypassGovernanceRetention']
    for bucket in BUCKETS:
        policy = {'Version': '2012-10-17', 'Statement': [{
            'Sid': 'PointFinderApplicationRestriction', 'Effect': 'Deny',
            'Principal': principal,
            'Action': 's3:*' if bucket == BUCKETS[1] else admin_actions,
            'Resource': ['arn:aws:s3:::' + bucket, 'arn:aws:s3:::' + bucket + '/*']}]}
        try:
            old = json.loads(admin.get_bucket_policy(Bucket=bucket)['Policy'])
        except ClientError as error:
            if error.response['Error']['Code'] != 'NoSuchBucketPolicy':
                raise
            old = None
        if old is not None and old != policy:
            raise RuntimeError('Unexpected policy; preserve and review before mutation')
        if old is None:
            admin.put_bucket_policy(Bucket=bucket, Policy=json.dumps(policy))
        assert json.loads(admin.get_bucket_policy(Bucket=bucket)['Policy']) == policy
        print(json.dumps({'bucket': bucket, 'policy_verified': True}), flush=True)

    for operation, args in [
        (app.list_objects_v2, {'Bucket': BUCKETS[1]}),
        (app.get_bucket_policy, {'Bucket': BUCKETS[0]})]:
        try:
            operation(**args)
        except ClientError as error:
            assert error.response['ResponseMetadata']['HTTPStatusCode'] == 403
        else:
            raise RuntimeError('Expected access denial did not occur')
    key = '_verification/app-permissions-' + str(uuid.uuid4())
    versions = []
    try:
        result = app.put_object(Bucket=BUCKETS[0], Key=key, Body=b'permission-probe')
        versions.append(result['VersionId'])
        with app.get_object(Bucket=BUCKETS[0], Key=key)['Body'] as stream:
            assert stream.read() == b'permission-probe'
        result = app.delete_object(Bucket=BUCKETS[0], Key=key)
        versions.append(result['VersionId'])
        admin.list_objects_v2(Bucket=BUCKETS[1], MaxKeys=1)
        print(json.dumps({'application_upload_read_delete': 'passed',
                          'backup_access': 'denied', 'upload_policy_access': 'denied',
                          'administrator_recovery_access': 'preserved'}), flush=True)
    finally:
        for version in versions:
            admin.delete_object(Bucket=BUCKETS[0], Key=key, VersionId=version)


if __name__ == '__main__':
    try:
        main()
    except ClientError as error:
        raise SystemExit('S3 request failed: ' + error.response['Error']['Code']) from None
