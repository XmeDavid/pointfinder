"""Prepare protected production credentials/backups on Hetzner; no deployment."""
import json
import os
import pathlib
import secrets
import subprocess

assert os.geteuid() == 0 and os.uname().nodename == 'davidsbatista'
os.umask(0o077)
cid = subprocess.check_output(['docker', 'ps', '-q', '--filter',
    'label=com.docker.swarm.service.name=pointfinder-database-bt29ko'], text=True).strip()
assert cid and '\n' not in cid
info = json.loads(subprocess.check_output(['docker', 'inspect', cid]))[0]
env = dict(s.split('=', 1) for s in info['Config']['Env'] if '=' in s)
assert env['POSTGRES_USER'] == 'scout'
directory = pathlib.Path('/etc/dokploy/pointfinder/ha-secrets')
directory.mkdir(mode=0o700, parents=True, exist_ok=True)
path = directory / 'patroni-auth.json'
if not path.exists():
    with path.open('x') as f:
        json.dump({'superuser_username': env['POSTGRES_USER'], 'superuser': env['POSTGRES_PASSWORD'],
                   'replication': secrets.token_urlsafe(36), 'api': secrets.token_urlsafe(36)}, f)
auth = json.loads(path.read_text())
assert auth['superuser'] == env['POSTGRES_PASSWORD']
(directory / 'etcd-auth.json').write_bytes(pathlib.Path('/var/backups/pointfinder-ha/etcd-production.json').read_bytes())
backup = pathlib.Path('/var/backups/pointfinder-ha/production-adoption')
backup.mkdir(mode=0o700, exist_ok=False)
(backup / 'database-service.json').write_bytes(subprocess.check_output(['docker', 'service', 'inspect', 'pointfinder-database-bt29ko']))
(backup / 'backend-service.json').write_bytes(subprocess.check_output(['docker', 'service', 'inspect', 'pointfinder-backend-v4djml']))
for name in ('postgresql.conf', 'postgresql.auto.conf', 'pg_hba.conf', 'pg_ident.conf'):
    (backup / name).write_bytes(pathlib.Path('/mnt/HC_Volume_105155434/pgdata', name).read_bytes())
# SQL goes through stdin and is never logged or put in process arguments.
# Leave an existing role untouched rather than silently changing its password.
query = "SELECT count(*) FROM pg_roles WHERE rolname='pf_replicator'"
base = ['docker', 'exec', '-i', cid, 'psql', '-U', env['POSTGRES_USER'], '-d', env['POSTGRES_DB'], '-v', 'ON_ERROR_STOP=1', '-At']
r = subprocess.run(base, input=query, text=True, capture_output=True, check=True)
assert r.stdout.strip() == '0', 'Replication role already exists; inspect before continuing'
sql = "CREATE ROLE pf_replicator WITH LOGIN REPLICATION PASSWORD '" + auth['replication'] + "';"
r = subprocess.run(base, input=sql, text=True, capture_output=True)
if r.returncode:
    raise SystemExit('Replication role creation failed; response withheld')
print('Protected adoption configuration and rollback state prepared; replication role created')
