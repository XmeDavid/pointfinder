"""Change only the running backend JDBC hostname through the local Docker API."""
import http.client
import json
import socket
import sys

class Docker(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect('/var/run/docker.sock')

def call(method, path, body=None):
    conn = Docker('localhost')
    conn.request(method, path, body=None if body is None else json.dumps(body),
                 headers={'Content-Type': 'application/json'})
    response = conn.getresponse()
    data = response.read()
    if response.status >= 300:
        raise SystemExit('Docker API request failed: HTTP ' + str(response.status))
    return json.loads(data) if data else None

service = call('GET', '/services/pointfinder-backend-v4djml')
spec = service['Spec']
container = spec['TaskTemplate']['ContainerSpec']
if not container['Image'].startswith('pointfinder-backend-v4djml:ha-preserved-20260909t170552z'):
    raise SystemExit('Running release changed; refusing implicit deployment')
old, new = ('pointfinder-database-bt29ko', 'pointfinder-db-router')
if sys.argv[1] == 'rollback':
    old, new = new, old
elif sys.argv[1] != 'cutover':
    raise SystemExit('Expected cutover or rollback')
matches = [e for e in container['Env'] if e.startswith('SPRING_DATASOURCE_URL=')]
assert len(matches) == 1 and ('//' + old + ':') in matches[0]
container['Env'] = [e.replace('//' + old + ':', '//' + new + ':', 1)
                    if e.startswith('SPRING_DATASOURCE_URL=') else e for e in container['Env']]
call('POST', '/services/' + service['ID'] + '/update?version=' + str(service['Version']['Index']), spec)
print('Only JDBC hostname changed; preserved application image and other environment')
