"""Restore real encrypted S3 backup into a unique unpublished test container.

No live PGDATA or production network membership is used. Outbound networking
is needed for S3 WAL retrieval; PostgreSQL listens only on its local socket.
Replication and archive-push are explicitly disabled. Never print raw logs.
"""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

IMAGE = 'pointfinder-patroni:16.15-4.1.5-production-pgbackrest-r2'
CONFIG = '/run/pgbackrest/pgbackrest.conf'
SECRET = '/etc/dokploy/pointfinder/ha-secrets/pgbackrest-postgres.conf'
target = sys.argv[1]
datetime.datetime.fromisoformat(target)
name = 'pf-s3-restore-' + uuid.uuid4().hex[:10]
volume = name + '-data'
stage = 'prepare'

def run(args, timeout=60):
    r = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=timeout)
    if r.returncode:
        raise RuntimeError('Docker operation failed in ' + stage + '; exit ' + str(r.returncode))
    return r.stdout.strip()

limits = ['--memory=512m', '--cpus=1', '--pids-limit=256', '--security-opt=no-new-privileges']
mounts = ['-v', volume + ':/var/lib/postgresql/data', '-v', SECRET + ':' + CONFIG + ':ro']
if os.environ.get('POINTFINDER_MAC_RESTORE_ROOT'):
    root = Path(os.environ['POINTFINDER_MAC_RESTORE_ROOT'])
    assert root.parent == Path('/srv/pointfinder-s3/backup-snapshot-state')
    assert root.name.startswith('restore-rehearsal-') and root.is_dir()
    assert not root.is_symlink()
    secret = root / 'pgbackrest.conf'
    assert secret.is_file() and secret.stat().st_mode & 0o077 == 0
    mounts = ['-v', volume + ':/var/lib/postgresql/data',
              '-v', str(secret) + ':' + CONFIG + ':ro',
              '-v', str(root / 'repo') + ':/recovery-repo:ro']
    limits += ['--network=none']
containers = []
try:
    run(['image', 'inspect', '--format', '{{.Id}}', IMAGE])
    # A unique prefix protects all existing production and previous test data.
    assert not run(['volume', 'ls', '--filter', 'name=^' + volume + '$', '--format', '{{.Name}}'])
    run(['volume', 'create', '--label', 'pointfinder.restore-test=true', volume])
    stage = 'restore-files'
    restore = name + '-files'
    run(['run', '-d', '--name', restore, '--label', 'pointfinder.restore-test=true',
         '--user=999:999', *limits, *mounts, '--entrypoint=pgbackrest', IMAGE,
         '--config=' + CONFIG, '--stanza=pointfinder-production', '--type=time',
         '--target=' + target, '--target-action=promote', 'restore'])
    containers.append(restore)
    assert run(['wait', restore], timeout=300) == '0', 'Restore failed; inspect protected logs'
    stage = 'recover-wal'
    run(['run', '-d', '--name', name, '--label', 'pointfinder.restore-test=true',
         '--user=999:999', *limits, *mounts, '--entrypoint=postgres', IMAGE,
         '-c', 'listen_addresses=', '-c', 'primary_conninfo=', '-c', 'primary_slot_name=',
         '-c', 'archive_mode=off', '-c', 'max_connections=100'])
    containers.append(name)
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        ready = subprocess.run(['docker','exec','-u','postgres',name,'psql','-U','scout',
                                '-d','postgres','-Atc','SELECT pg_is_in_recovery()'],
                               capture_output=True,text=True,timeout=10)
        if ready.returncode == 0 and ready.stdout.strip() == 'f':
            break
        if run(['inspect','--format','{{.State.Running}}',name]) != 'true':
            raise RuntimeError('Recovery container stopped; inspect protected logs')
        time.sleep(2)
    else:
        raise RuntimeError('Timed out waiting for recovery')
    stage = 'verify'
    sql = "SELECT system_identifier FROM pg_control_system(); SELECT count(*) FROM flyway_schema_history WHERE success; SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'; SHOW archive_mode; SHOW listen_addresses; SHOW primary_conninfo;"
    result = run(['exec','-u','postgres',name,'psql','-v','ON_ERROR_STOP=1','-U','scout',
                  '-d','pointfinder','-Atc',sql]).splitlines()
    assert result[:4] == ['7605372262247206949','69','46','off'], 'Restored schema/identity mismatch'
    assert all(not value for value in result[4:]), 'Restored database isolation mismatch'
    print(json.dumps({'result':'passed','target':target,'migrations':69,'tables':46,
                      'container':name,'volume':volume}),flush=True)
except Exception as error:
    print(json.dumps({'result':'failed','stage':stage,'error_type':type(error).__name__,
                      'containers':containers,'volume':volume}),flush=True)
    sys.exit(1)
finally:
    for container in containers:
        subprocess.run(['docker','stop','-t','30',container],capture_output=True,timeout=60)
