"""Root-only Dokploy recovery export; contains secrets, never print contents.

The archive is NOT encrypted at rest. It must stay root-only on trusted hosts
and travel only through SSH; never upload it to the application media bucket.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess

os.umask(0o077)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
directory=Path('/var/backups/pointfinder-ha/control-plane')
directory.mkdir(mode=0o700,parents=True,exist_ok=True)
stage=directory/('export-'+stamp)
stage.mkdir(mode=0o700)
services=['dokploy','dokploy-postgres','dokploy-redis']
for service in services:
    p=subprocess.run(['docker','service','inspect',service],capture_output=True,check=True)
    (stage/(service+'-service.json')).write_bytes(p.stdout)
ids=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.swarm.service.name=dokploy-postgres'],text=True).split()
assert len(ids)==1
cid=ids[0]
c=json.loads(subprocess.check_output(['docker','inspect',cid]))[0]
env=dict(item.split('=',1) for item in c['Config']['Env'] if '=' in item)
user=env.get('POSTGRES_USER','postgres'); database=env.get('POSTGRES_DB',user)
dump=stage/'dokploy.dump'
with dump.open('xb') as out:
    p=subprocess.run(['docker','exec',cid,'pg_dump','-U',user,'-d',database,'--format=custom','--no-owner','--no-acl'],stdout=out,stderr=subprocess.PIPE)
assert p.returncode==0,'Control-plane dump failed; output suppressed'
with dump.open('rb') as data:
    p=subprocess.run(['docker','exec','-i',cid,'pg_restore','--list'],stdin=data,capture_output=True)
assert p.returncode==0,'Dump archive validation failed'
archive=directory/('dokploy-control-plane-'+stamp+'.tar.gz')
p=subprocess.run(['tar','--exclude=*/code','--exclude=*/logs','--exclude=*/.git',
    '--exclude=*/node_modules','-czf',str(archive),'-C',str(stage),'.','-C','/','etc/dokploy'],capture_output=True)
assert p.returncode==0,'Control-plane archive failed; output suppressed'
os.chmod(archive,0o600)
with archive.open('rb') as f:
    digest=hashlib.file_digest(f,'sha256').hexdigest()
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'sha256':digest,
                  'confidential':True,'encrypted_at_rest':False}))
