"""Run once as root on VM 102. Clone the verified restore; never touch production."""
import json
import pathlib
import secrets
import subprocess
import time
import os

# Full name from the restore container is checked, rather than relying on a prefix.
SOURCE = '804bb73d222b2aaa565922d937518ffce6a6ddb6e5531c61b5eac424dad34791'
TARGET = 'pointfinder-patroni-rehearsal-primary'
CONTAINER = 'pointfinder-patroni-rehearsal-prep'
SECRET = 'pointfinder-patroni-rehearsal-auth-v1'
IMAGE = 'postgres@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94'

def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    if result.returncode:
        # SQL input and credential-bearing diagnostics must not enter logs.
        raise RuntimeError('Rehearsal operation failed: ' + ' '.join(args[:3]))
    return result.stdout

restore = json.loads(run(['docker', 'inspect', 'pointfinder-restore-check']))[0]
assert not restore['State']['Running'], 'Original restore must remain stopped'
assert any(m.get('Name') == SOURCE for m in restore['Mounts'])
assert subprocess.run(['docker', 'volume', 'inspect', TARGET], capture_output=True).returncode != 0, 'Target already exists; inspect before retrying'
assert subprocess.run(['docker', 'secret', 'inspect', SECRET], capture_output=True).returncode != 0, 'Secret already exists; inspect before retrying'
run(['docker', 'volume', 'create', TARGET])
run(['docker', 'run', '--rm', '--network', 'none', '--memory', '128m',
     '-v', SOURCE + ':/source:ro', '-v', TARGET + ':/target', IMAGE,
     'sh', '-c', 'cp -a /source/. /target/'])
auth = {key: secrets.token_hex(32) for key in ('superuser', 'replication', 'api')}
os.umask(0o077)
auth_path = pathlib.Path('/var/backups/pointfinder-ha/rehearsal-auth.json')
with auth_path.open('x') as stream:
    json.dump(auth, stream)
run(['docker', 'run', '-d', '--name', CONTAINER, '--network', 'none',
     '--memory', '384m', '--cpus', '1', '-v', TARGET + ':/var/lib/postgresql/data', IMAGE])
try:
    for attempt in range(30):
        if subprocess.run(['docker', 'exec', CONTAINER, 'pg_isready', '-U', 'postgres'], capture_output=True).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Rehearsal PostgreSQL did not become ready')
    sql = ("SET password_encryption = 'scram-sha-256';\n"
           "ALTER ROLE postgres PASSWORD '" + auth['superuser'] + "';\n"
           "CREATE ROLE replicator WITH LOGIN REPLICATION PASSWORD '" + auth['replication'] + "';\n")
    run(['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'restorecheck', '-v', 'ON_ERROR_STOP=1'], sql.encode())
    run(['docker', 'secret', 'create', SECRET, '-'], json.dumps(auth).encode())
finally:
    run(['docker', 'stop', '--time', '60', CONTAINER])
print('Cloned restore prepared; credentials provisioned without disclosure; preparation container stopped.')
