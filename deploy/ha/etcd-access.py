"""Run as root on Hetzner. Credentials stay in memory/root-only files.

prepare provisions identities WITHOUT enabling auth. enable is a separate gate,
after all Patroni clients are configured and the rehearsal is paused.
"""
import base64
import json
import os
import pathlib
import secrets
import subprocess
import sys
import urllib.request

assert os.geteuid() == 0 and os.uname().nodename == 'davidsbatista'
os.umask(0o077)
path = pathlib.Path('/var/backups/pointfinder-ha/etcd-auth.json')
if not path.exists():
    if sys.argv[1] != 'prepare':
        raise SystemExit('Credential recovery file missing')
    with path.open('x') as f:
        json.dump({u: secrets.token_urlsafe(36) for u in ('root', 'rehearsal', 'production')}, f)
credentials = json.loads(path.read_text())
cid = subprocess.check_output(['docker', 'ps', '-q', '--filter',
    'label=com.docker.swarm.service.name=pointfinder-quorum-ltydfj_etcd-hetzner'], text=True).strip()
info = json.loads(subprocess.check_output(['docker', 'inspect', cid]))[0]
pid = info['State']['Pid']
token = None
def call(endpoint, data):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = token
    # Enter only the local etcd network namespace; no ports or auth files exposed.
    runner = '''import json,sys,urllib.request
p=json.load(sys.stdin)
r=urllib.request.Request('http://127.0.0.1:2379/v3/'+p['endpoint'],data=json.dumps(p['data']).encode(),headers=p['headers'])
with urllib.request.urlopen(r,timeout=10) as response: print(response.read().decode())
'''
    proc = subprocess.run(['nsenter', '-t', str(pid), '-n', 'python3', '-c', runner],
        input=json.dumps({'endpoint': endpoint, 'data': data, 'headers': headers}),
        text=True, capture_output=True)
    if proc.returncode:
        raise SystemExit('etcd request failed at ' + endpoint + '; response withheld')
    result = json.loads(proc.stdout)
    if 'error' in result:
        raise SystemExit('etcd API error at ' + endpoint)
    return result
def b64(s):
    return base64.b64encode(s.encode()).decode()

mode = sys.argv[1]
if mode == 'prepare':
    assert not call('auth/status', {}).get('enabled')
    users = call('auth/user/list', {}).get('users', [])
    roles = call('auth/role/list', {}).get('roles', [])
    for user in credentials:
        if user not in users:
            call('auth/user/add', {'name': user, 'password': credentials[user]})
        if user not in roles:
            call('auth/role/add', {'name': user})
        call('auth/user/grant', {'user': user, 'role': user})
        if user != 'root':
            prefix = '/pointfinder-ha/pointfinder-' + user + '/'
            call('auth/role/grant', {'name': user, 'perm': {'permType': 'READWRITE',
                'key': b64(prefix), 'range_end': b64(prefix[:-1] + '0')}})
            with pathlib.Path('/var/backups/pointfinder-ha/etcd-' + user + '.json').open('w') as f:
                json.dump({'username': user, 'password': credentials[user]}, f)
    print('Prepared root and namespace-scoped clients; authentication remains disabled')
else:
    if mode == 'enable':
        call('auth/enable', {})
    token = call('auth/authenticate', {'name': 'root', 'password': credentials['root']})['token']
    if mode == 'disable':
        call('auth/disable', {})
    print('Authentication enabled:', call('auth/status', {}).get('enabled', False))
    if mode == 'lease':
        entries = call('kv/range', {'key': b64('/pointfinder-ha/pointfinder-rehearsal/'), 'range_end': b64('/pointfinder-ha/pointfinder-rehearsal0')}).get('kvs', [])
        print([(base64.b64decode(x['key']).decode(), x.get('lease')) for x in entries])
        rows = call('kv/range', {'key': b64('/pointfinder-ha/pointfinder-rehearsal/leader')}).get('kvs', [])
        for row in rows:
            print('Leader name:', base64.b64decode(row['value']).decode())
            lease = row.get('lease', '0')
            print('Leader lease ID:', lease)
            if lease != '0':
                result = call('lease/timetolive', {'ID': lease})
                print({k: result.get(k) for k in ('TTL', 'grantedTTL')})
    if mode in ('enable', 'verify'):
        health_env = dict(os.environ, ETCDCTL_USER='root', ETCDCTL_PASSWORD=credentials['root'])
        health = subprocess.run(['docker', 'exec', '-e', 'ETCDCTL_USER', '-e', 'ETCDCTL_PASSWORD', cid, 'etcdctl',
            '--endpoints=http://etcd-hetzner:2379,http://etcd-arthur:2379,http://etcd-rainer:2379',
            'endpoint', 'health'], env=health_env, text=True,
            capture_output=True, timeout=25)
        if health.returncode:
            diagnostic = health.stderr
            for secret in credentials.values():
                diagnostic = diagnostic.replace(secret, '[redacted]')
            raise SystemExit('Authenticated endpoint health failed: ' + diagnostic[-1200:])
        print('All three endpoints passed authenticated health checks')
        for user in ('rehearsal', 'production'):
            token = call('auth/authenticate', {'name': user, 'password': credentials[user]})['token']
            prefix = '/pointfinder-ha/pointfinder-' + user + '/'
            call('kv/range', {'key': b64(prefix), 'range_end': b64(prefix[:-1] + '0')})
            probe = prefix + 'access-test-' + secrets.token_hex(8)
            call('kv/put', {'key': b64(probe), 'value': b64('authorization-test')})
            call('kv/deleterange', {'key': b64(probe)})
            other = 'production' if user == 'rehearsal' else 'rehearsal'
            try:
                call('kv/range', {'key': b64('/pointfinder-ha/pointfinder-' + other + '/config')})
            except SystemExit:
                print(user + ': other namespace denied')
            else:
                raise SystemExit('FAIL: cross-namespace read permitted')
        token = None
        try:
            call('kv/range', {'key': b64('/pointfinder-ha/pointfinder-rehearsal/config')})
        except SystemExit:
            print('Anonymous read denied')
        else:
            raise SystemExit('FAIL: anonymous read permitted')
        print('Both scoped clients authenticated and read their own namespace')
