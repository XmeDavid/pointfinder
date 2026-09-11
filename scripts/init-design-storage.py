#!/usr/bin/env python3
"""Create the private bucket in the isolated local design MinIO service."""
import datetime
import hashlib
import hmac
import os
import urllib.error
import urllib.request

host = os.environ.get('PF_DESIGN_HOST', '192.168.0.212') + ':8190'
now = datetime.datetime.now(datetime.timezone.utc)
date = now.strftime('%Y%m%d')
stamp = now.strftime('%Y%m%dT%H%M%SZ')
payload_hash = hashlib.sha256(b'').hexdigest()
path = '/pointfinder-design'
headers = f'host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{stamp}\n'
signed_headers = 'host;x-amz-content-sha256;x-amz-date'
canonical = '\n'.join(['PUT', path, '', headers, signed_headers, payload_hash])
scope = f'{date}/us-east-1/s3/aws4_request'
to_sign = '\n'.join(['AWS4-HMAC-SHA256', stamp, scope, hashlib.sha256(canonical.encode()).hexdigest()])
key = b'AWS4pointfinder-local-storage-only'
for part in [date, 'us-east-1', 's3', 'aws4_request']:
    key = hmac.new(key, part.encode(), hashlib.sha256).digest()
signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
request = urllib.request.Request(f'http://{host}{path}', data=b'', method='PUT', headers={
    'X-Amz-Date': stamp,
    'X-Amz-Content-Sha256': payload_hash,
    'Authorization': f'AWS4-HMAC-SHA256 Credential=pointfinder-local/{scope}, SignedHeaders={signed_headers}, Signature={signature}',
})
try:
    with urllib.request.urlopen(request, timeout=10) as response:
        print('Local document storage ready.')
except urllib.error.HTTPError as error:
    if error.code != 409:
        raise
    print('Local document storage already exists.')
