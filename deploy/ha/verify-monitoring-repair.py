"""Run on a DB host: Linux unit tests and read-only live SQL smoke test.

Usage: python3 - HOST /tmp/pointfinder-monitor-build.XXXXXX < this-file.py
Only disposable, network-disabled test containers are created. No email
credentials or PGDATA are mounted; the live smoke uses the existing socket.
"""
import json
from pathlib import Path
import subprocess
import sys

host, directory = sys.argv[1:]
assert host in {'hetzner', 'rainer'}
directory = Path(directory).resolve()
assert directory.parent == Path('/tmp') and directory.name.startswith('pointfinder-monitor-build.')
prefix = 'pointfinder-patroni:16.15-4.1.5-production-'
for area, component in [('monitoring', 'monitor'), ('alerting', 'alerting')]:
    result = subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--read-only',
        '--memory', '128m', '--cpus', '0.5', '--tmpfs', '/tmp:size=64m',
        '-v', str(directory / area) + ':/tests:ro',
        '--entrypoint', '/opt/patroni/bin/python', prefix + component + '-r2',
        '-m', 'unittest', 'discover', '-s', '/tests'], capture_output=True, text=True, timeout=120)
    lines = result.stderr.splitlines()
    print(host, area, 'exit', result.returncode, flush=True)
    print('\n'.join(lines[-5:]), flush=True)
    if result.returncode:
        raise SystemExit('Linux unit verification failed; review isolated test output')

container = {'hetzner': 'pointfinder-pg-hetzner-vv3yw0-patroni-hetzner-1',
             'rainer': 'pointfinder-pg-rainer-0u6pju-patroni-rainer-1'}[host]
mounts = json.loads(subprocess.check_output(['docker', 'inspect', '--format', '{{json .Mounts}}', container]))
socket_volume = next(m['Name'] for m in mounts if m['Destination'] == '/var/run/postgresql' and m['Type'] == 'volume')
code = '''
import datetime, json, sys
sys.path.insert(0, '/opt/pointfinder-monitor')
import monitor
s = monitor.Settings()
checks, role = monitor.check_database(s, monitor.Database, datetime.datetime.now(monitor.UTC))
print(json.dumps({'role': role, 'checks': {c.name: c.to_json() for c in checks}}))
assert all(c.status == monitor.OK for c in checks), 'Read-only SQL smoke failed'
'''
result = subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--read-only',
    '--memory', '128m', '--cpus', '0.25', '--user', '999:999', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true',
    '-v', socket_volume + ':/var/run/postgresql:ro',
    '-e', 'PATRONI_NAME=production-' + host,
    '-e', 'POINTFINDER_MONITOR_EXPECTED_STANDBYS=production-hetzner,production-rainer',
    '--entrypoint', '/opt/patroni/bin/python', prefix + 'monitor-r2', '-c', code],
    capture_output=True, text=True, timeout=30)
# The snippet projects only monitor-generated, secret-free check results.
print(result.stdout, flush=True)
if result.returncode:
    raise SystemExit('Live SQL verification failed')
print(host + ': Linux suites and live read-only SQL checks passed')
