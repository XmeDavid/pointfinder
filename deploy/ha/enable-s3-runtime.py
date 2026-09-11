"""Run on Hetzner with resolved S3 values on stdin; preserve image and all other env."""
import http.client
import json
import socket
import sys
import os
import pathlib
import datetime

class Docker(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect('/var/run/docker.sock')

def call(method, path, body=None):
    conn = Docker('localhost')
    conn.request(method, path, None if body is None else json.dumps(body), {'Content-Type': 'application/json'})
    response = conn.getresponse()
    data = response.read()
    if response.status >= 300:
        raise SystemExit('Docker API failed HTTP ' + str(response.status))
    return json.loads(data) if data else None

values = json.load(sys.stdin)
required = {'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'}
assert set(values) == required and all(values.values())
values['STORAGE_TYPE'] = 's3'
required.add('STORAGE_TYPE')
service = call('GET', '/services/pointfinder-backend-v4djml')
spec = service['Spec']
container = spec['TaskTemplate']['ContainerSpec']
assert container['Image'] == 'pointfinder-backend-v4djml:ha-preserved-20260909t170552z'
os.umask(0o077)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = pathlib.Path('/var/backups/pointfinder-ha/production-adoption') / ('before-s3-' + stamp + '.json')
with backup.open('x') as stream:
    json.dump(service, stream)
env = [e for e in container.get('Env', []) if not any(e.startswith(k + '=') for k in required)]
env.extend(k + '=' + values[k] for k in sorted(required))
container['Env'] = env
result = call('POST', '/services/' + service['ID'] + '/update?version=' + str(service['Version']['Index']), spec)
print(json.dumps({'updated': True, 'image_preserved': True, 'service_id_present': bool(result)}), flush=True)
