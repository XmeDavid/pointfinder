"""Run as root on Hetzner. Guarded HA-only first-replica update; no env output."""
import datetime
import http.client
import json
import os
import pathlib
import socket
import subprocess

class Docker(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect('/var/run/docker.sock')

def call(method, path, body=None):
    conn = Docker('localhost')
    conn.request(method, path, None if body is None else json.dumps(body),
                 {'Content-Type': 'application/json'})
    response = conn.getresponse()
    data = response.read()
    if response.status >= 300:
        raise SystemExit('Docker API failed HTTP ' + str(response.status))
    return json.loads(data) if data else None

image = 'pointfinder-backend-v4djml:ha-3aa57d3ba874'
image_id = subprocess.check_output(['docker', 'image', 'inspect', image,
    '--format', '{{.Id}}'], text=True).strip()
assert image_id == 'sha256:4672e58da36f9ea03f3ba4c344f998429038257188d89e7262467940feb30736'
service = call('GET', '/services/pointfinder-backend-v4djml')
spec = service['Spec']
container = spec['TaskTemplate']['ContainerSpec']
assert container['Image'] == 'pointfinder-backend-v4djml:ha-preserved-20260909t170552z'
assert spec['Mode']['Replicated']['Replicas'] == 1
assert any(c.replace(' ', '') == 'node.hostname==davidsbatista'
           for c in spec['TaskTemplate']['Placement']['Constraints'])
assert 'STORAGE_TYPE=s3' in container['Env']
os.umask(0o077)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = pathlib.Path('/var/backups/pointfinder-ha/production-adoption') / ('before-ha-release-' + stamp + '.json')
with backup.open('x') as stream:
    json.dump(service, stream)
container['Image'] = image
container['Env'] = [e for e in container['Env'] if not e.startswith('APP_INSTANCE_ID=')]
container['Env'].append('APP_INSTANCE_ID={{.Service.Name}}-{{.Task.Slot}}')
container['Healthcheck'] = {
    'Test': ['CMD-SHELL', 'curl --fail --silent --max-time 5 http://127.0.0.1:8080/actuator/health >/dev/null'],
    'Interval': 15000000000, 'Timeout': 7000000000,
    'StartPeriod': 120000000000, 'Retries': 3,
}
spec['UpdateConfig'] = {'Parallelism': 1, 'FailureAction': 'rollback',
    'Monitor': 90000000000, 'MaxFailureRatio': 0, 'Order': 'stop-first'}
spec['RollbackConfig'] = {'Parallelism': 1, 'FailureAction': 'pause',
    'Monitor': 90000000000, 'MaxFailureRatio': 0, 'Order': 'stop-first'}
call('POST', '/services/' + service['ID'] + '/update?version=' + str(service['Version']['Index']), spec)
print('HA-only rollout requested on Hetzner; protected rollback spec: ' + str(backup))
