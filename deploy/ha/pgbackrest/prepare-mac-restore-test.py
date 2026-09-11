"""Run as root on Rainer; reconstruct encrypted repository from Garage archive.

No Hetzner access. Uses only the latest completed, checksum-verified manifest.
Creates a unique protected rehearsal directory, never overwrites or deletes data.
"""
import json
import os
from pathlib import Path
import subprocess
import uuid

os.umask(0o077)
root = Path('/srv/pointfinder-s3/backup-snapshot-state') / ('restore-rehearsal-' + uuid.uuid4().hex[:12])
root.mkdir(mode=0o700)
code = r'''
import hashlib,json,os,sys
from pathlib import Path, PurePosixPath
sys.path.insert(0,'/opt/recovery')
from runner import client
root=Path('/state')/sys.argv[1]
repo=root/'repo'
repo.mkdir(mode=0o700)
values=json.loads(Path('/run/secrets/recovery-client.json').read_text())
s3=client(values['target'],'http://garage:3900','garage')
state=json.loads(Path('/state/last-success.json').read_text())
bucket='pointfinder-recovery'
with s3.get_object(Bucket=bucket,Key=state['manifest'])['Body'] as body:
    manifest=json.load(body)
assert manifest['source_bucket']=='pointfinder-prod-backups-202609'
count=0
for entry in manifest['entries']:
    if not entry['latest'] or entry['deleted']: continue
    key=PurePosixPath(entry['key'])
    assert not key.is_absolute() and '..' not in key.parts
    destination=repo.joinpath(*key.parts)
    destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    sha=hashlib.sha256(); size=0
    with s3.get_object(Bucket=bucket,Key=entry['archive_key'])['Body'] as body, destination.open('xb') as out:
        while True:
            chunk=body.read(1024*1024)
            if not chunk: break
            out.write(chunk); sha.update(chunk); size+=len(chunk)
    assert sha.hexdigest()==entry['sha256'] and size==entry['size']
    count+=1
print(json.dumps({'manifest':state['manifest'],'restored_objects':count}))
'''
result = subprocess.run(['docker','exec','-i','compose-program-virtual-sensor-qkslhw-backup-recovery-1',
                         'python3','-',root.name],input=code,text=True,capture_output=True,timeout=300)
if result.returncode:
    raise SystemExit('Mac archive reconstruction failed; output suppressed; rehearsal retained at '+str(root))
summary=json.loads(result.stdout)
original=Path('/etc/dokploy/pointfinder/ha-secrets/pgbackrest.conf').read_text()
lines=[]
for line in original.splitlines():
    if line.startswith('repo1-s3-'): continue
    if line.startswith('repo1-type='): line='repo1-type=posix'
    if line.startswith('repo1-path='): line='repo1-path=/recovery-repo/pgbackrest'
    lines.append(line)
config=root/'pgbackrest.conf'
with config.open('x') as out: out.write('\n'.join(lines)+'\n')
for path in [root,*root.rglob('*')]:
    assert not path.is_symlink()
    os.chown(path,999,999)
    os.chmod(path,0o700 if path.is_dir() else 0o400)
print(json.dumps({'root':str(root),**summary}))
