"""Local S3 acceptance probe. Never display credentials or signed URLs."""
import subprocess
import uuid
import boto3
from botocore import UNSIGNED
from botocore.config import Config
from botocore.exceptions import ClientError

SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-i',
       '/Users/xmedavid/.ssh/vectr', 'debian@192.168.0.236']
ENDPOINT = 'http://100.75.57.44:3900'

def client():
    raw = subprocess.check_output(SSH + [
        'sudo cat /etc/dokploy/pointfinder/ha-secrets/garage.env'], text=True)
    values = dict(line.split('=', 1) for line in raw.splitlines() if '=' in line)
    return boto3.client('s3', endpoint_url=ENDPOINT, region_name='garage',
        aws_access_key_id=values['GARAGE_DEFAULT_ACCESS_KEY'],
        aws_secret_access_key=values['GARAGE_DEFAULT_SECRET_KEY'],
        config=Config(request_checksum_calculation='when_required',
                      response_checksum_validation='when_required',
                      s3={'addressing_style': 'path'}))

def main():
    s3 = client()
    bucket = 'pointfinder-recovery'
    key = '_verification/' + str(uuid.uuid4())
    body = b'PointFinder Mac recovery acceptance probe'
    s3.head_bucket(Bucket=bucket)
    try:
        s3.put_object(Bucket=bucket, Key=key, Body=body)
        with s3.get_object(Bucket=bucket, Key=key)['Body'] as stream:
            assert stream.read() == body
        anon = boto3.client('s3', endpoint_url=ENDPOINT, region_name='garage',
                            config=Config(signature_version=UNSIGNED))
        for method, args in [(anon.get_object, {'Key': key}),
                             (anon.list_objects_v2, {})]:
            try:
                method(Bucket=bucket, **args)
            except ClientError as error:
                assert error.response['ResponseMetadata']['HTTPStatusCode'] == 403
            else:
                raise RuntimeError('Anonymous access unexpectedly allowed')
        print('Authenticated S3 write/read passed; anonymous GET/list denied.')
    finally:
        s3.delete_object(Bucket=bucket, Key=key)

if __name__ == '__main__':
    main()
