"""Hourly append-only recovery snapshots; secrets are bind-mounted."""
import json
import os
from pathlib import Path
import shutil
import signal
import threading
import boto3
from botocore.config import Config
from snapshot import snapshot

stop = threading.Event()
signal.signal(signal.SIGTERM, lambda *_: stop.set())
signal.signal(signal.SIGINT, lambda *_: stop.set())

def client(values, endpoint, region):
    return boto3.client('s3', endpoint_url=endpoint, region_name=region,
        aws_access_key_id=values['access_key'], aws_secret_access_key=values['secret_key'],
        config=Config(connect_timeout=10, read_timeout=60,
                      retries={'max_attempts': 3}, s3={'addressing_style': 'path'},
                      request_checksum_calculation='when_required',
                      response_checksum_validation='when_required'))

def main():
    os.umask(0o077)
    values = json.loads(Path('/run/secrets/recovery-client.json').read_text())
    bucket = os.environ.get('SOURCE_BUCKET', 'pointfinder-prod-uploads-202609')
    if bucket not in {'pointfinder-prod-uploads-202609', 'pointfinder-prod-backups-202609'}:
        raise ValueError('Unsupported recovery source')
    source = client(values['source'], 'https://fsn1.your-objectstorage.com', 'fsn1')
    target = client(values['target'], 'http://garage:3900', 'garage')
    def guard(size):
        if stop.is_set():
            raise RuntimeError('Stopping')
        usage = shutil.disk_usage('/recovery-disk')
        if usage.free - size < max(5 * 1024**3, usage.total * .2):
            raise RuntimeError('Recovery disk free-space gate')
    while not stop.is_set():
        try:
            guard(0)
            result = snapshot(source, target, bucket, before_object=guard)
            temporary = Path('/state/last-success.partial')
            temporary.write_text(json.dumps(result))
            os.replace(temporary, '/state/last-success.json')
            print(json.dumps({'status': 'success', **result}), flush=True)
            delay = 3600
        except Exception as error:
            # Exception text may include an endpoint, signed request, or key.
            print(json.dumps({'status': 'failed', 'error_type': type(error).__name__}), flush=True)
            delay = 300
        stop.wait(delay)

if __name__ == '__main__':
    main()
