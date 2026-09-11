"""Run on Hetzner: isolated, network-disabled V66/V67 compatibility rehearsal.

JSON on stdin contains the two reviewed migration SQL texts. Production data
is restored only into a private temporary memory filesystem, never live PGDATA.
"""
import json
import pathlib
import subprocess
import sys
import time
import uuid

sql=json.load(sys.stdin)
name='pf-billing-order-'+uuid.uuid4().hex[:10]
backup=pathlib.Path('/var/backups/pointfinder-ha/pointfinder-20260910T081454Z.dump')
assert backup.is_file()
def run(args,**kwargs):
    return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kwargs)
try:
    run(['docker','run','-d','--name',name,'--network','none','--memory','512m',
         '--tmpfs','/var/lib/postgresql/data:rw,size=384m',
         '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=scout','-e','POSTGRES_DB=pointfinder',
         '--entrypoint','docker-entrypoint.sh',
         'pointfinder-patroni:16.15-4.1.5-production-pgbackrest-r2','postgres'])
    for _ in range(30):
        r=subprocess.run(['docker','exec',name,'pg_isready','-U','scout','-d','pointfinder'],capture_output=True)
        if r.returncode==0: break
        time.sleep(1)
    else: raise RuntimeError('Isolated PostgreSQL failed to become ready')
    with backup.open('rb') as stream:
        run(['docker','exec','-i',name,'pg_restore','-U','scout','-d','pointfinder',
             '--no-owner','--no-acl','--exit-on-error'],stdin=stream)
    for migration in ('66','67'):
        run(['docker','exec','-i',name,'psql','-U','scout','-d','pointfinder','-v','ON_ERROR_STOP=1'],
            input=sql[migration].encode())
    result=run(['docker','exec',name,'psql','-U','scout','-d','pointfinder','-Atc',
        "SELECT EXISTS(SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='invite_status' AND e.enumlabel='declined'), EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='org_invites' AND column_name='expires_at'), (SELECT count(*) FROM flyway_schema_history WHERE success);"])
    assert result.stdout.strip()==b't|t|69'
    print('V66/V67 SQL passed against isolated production-backup schema with V68-V71 already present.')
except Exception as exc:
    print('Rehearsal failed:',type(exc).__name__)
    raise SystemExit(1)
finally:
    subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
