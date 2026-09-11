"""Run on Hetzner; narrow authenticated Patroni operations, no secret output."""
import base64
import datetime
import json
import os
from pathlib import Path
import sys
import urllib.request

auth = json.loads(Path('/etc/dokploy/pointfinder/ha-secrets/patroni-auth.json').read_text())
header = 'Basic ' + base64.b64encode(('operator:' + auth['api']).encode()).decode()
base = 'http://100.113.30.54:18008'

def call(method, path, data=None):
    req = urllib.request.Request(base + path, method=method,
        headers={'Authorization': header, 'Content-Type': 'application/json'},
        data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read()
        return json.loads(raw) if raw.startswith(b'{') else {'http_status': response.status}

operation = sys.argv[1]
cluster = call('GET', '/cluster')
members = {m['name']: m for m in cluster['members']}
assert set(members) == {'production-hetzner', 'production-rainer'}
if operation == 'status':
    print([{k: m.get(k) for k in ('name', 'role', 'state', 'timeline', 'lag')}
           for m in members.values()])
elif operation == 'enable-archive':
    before = call('GET', '/config')
    os.umask(0o077)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    file = Path('/var/backups/pointfinder-ha/production-adoption') / ('before-archive-' + stamp + '.json')
    with file.open('x') as stream:
        json.dump(before, stream)
    parameters = {'archive_mode': 'on', 'archive_timeout': '60s',
        'archive_command': 'pgbackrest --config=/run/pgbackrest/pgbackrest.conf --stanza=pointfinder-production archive-push "%p"'}
    call('PATCH', '/config', {'postgresql': {'parameters': parameters}})
    after = call('GET', '/config')['postgresql']['parameters']
    assert all(after.get(k) == v for k,v in parameters.items())
    print('Archive parameters saved; archive_mode still requires rolling restart.')
elif operation == 'restart-standby':
    candidate = sys.argv[2]
    assert candidate in members and members[candidate]['role'] == 'replica'
    assert members[candidate]['state'] == 'streaming'
    base = {'production-hetzner': 'http://100.113.30.54:18008',
            'production-rainer': 'http://100.75.57.44:18008'}[candidate]
    status = call('GET', '/patroni')
    assert status.get('pending_restart'), 'Wait for pending restart before proceeding'
    call('POST', '/restart', {})
    print('Standby restart request completed.')
elif operation == 'switchover':
    candidate = sys.argv[2]
    assert candidate in members
    leader = next(m['name'] for m in members.values() if m['role'] == 'leader')
    assert leader != candidate
    assert members[candidate]['state'] == 'streaming' and members[candidate].get('lag', 0) == 0
    # Send to the active leader: the candidate's own Tailscale published-port
    # hairpin is not a reliable self-check from inside its Docker container.
    base = {'production-hetzner': 'http://100.113.30.54:18008',
            'production-rainer': 'http://100.75.57.44:18008'}[leader]
    call('POST', '/switchover', {'leader': leader, 'candidate': candidate})
    print('Controlled switchover request completed.')
else:
    raise SystemExit('Unknown operation')
