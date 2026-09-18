"""Run on Hetzner: enable cluster-wide standby archive retrieval safely.

No promotion, reinitialization, PGDATA deletion or primary restart. The secret
credential and full before-config stay on the host; output is projected.
"""
import base64
import datetime
import json
import os
from pathlib import Path
import sys
import urllib.request

COMMAND = ('pgbackrest --config=/run/pgbackrest/pgbackrest.conf '
           '--stanza=pointfinder-production --log-level-console=off '
           'archive-get "%f" "%p"')

def main():
    operation = sys.argv[1]
    assert operation in {'status', 'enable'}
    auth = json.loads(Path('/etc/dokploy/pointfinder/ha-secrets/patroni-auth.json').read_text())
    header = 'Basic ' + base64.b64encode(('operator:' + auth['api']).encode()).decode()
    def call(method, path, body=None):
        req = urllib.request.Request('http://100.113.30.54:18008' + path, method=method,
            headers={'Authorization': header, 'Content-Type': 'application/json'},
            data=json.dumps(body).encode() if body is not None else None)
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    cluster = call('GET', '/cluster')
    members = {m['name']: m for m in cluster['members']}
    assert set(members) == {'production-hetzner', 'production-rainer'}
    before = call('GET', '/config')
    if operation == 'enable':
        assert members['production-hetzner']['role'] == 'leader'
        assert members['production-hetzner']['state'] == 'running'
        assert members['production-rainer']['role'] == 'replica'
        assert all(m['timeline'] == 12 for m in members.values())
        pg = before['postgresql']
        assert pg['parameters']['archive_mode'] == 'on'
        assert 'pgbackrest' in pg['parameters']['archive_command']
        current = pg.get('recovery_conf', {}).get('restore_command', '')
        assert current in {'', COMMAND}, 'Unexpected existing restore command; review first'
        if current != COMMAND:
            os.umask(0o077)
            directory = Path('/var/backups/pointfinder-ha/replication-repair-20260917')
            directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
            with (directory / ('patroni-before-' + stamp + '.json')).open('x') as f:
                json.dump(before, f)
            call('PATCH', '/config', {'postgresql': {'recovery_conf': {'restore_command': COMMAND}}})
        after = call('GET', '/config')
        assert after['postgresql']['recovery_conf']['restore_command'] == COMMAND
        restored = json.loads(json.dumps(after))
        if 'recovery_conf' in before['postgresql']:
            restored['postgresql']['recovery_conf'] = before['postgresql']['recovery_conf']
        else:
            restored['postgresql'].pop('recovery_conf', None)
        assert restored == before, 'Unexpected concurrent configuration changes; review'
        print('Archive retrieval enabled for standbys; unrelated dynamic settings unchanged.')
    else:
        print(json.dumps({'archive_retrieval_configured': before['postgresql'].get('recovery_conf', {}).get('restore_command') == COMMAND,
            'members': [{k: m.get(k) for k in ('name', 'role', 'state', 'timeline', 'lag')} for m in members.values()]}))

if __name__ == '__main__':
    main()
