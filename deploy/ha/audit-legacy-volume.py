"""Read-only retirement gate: legacy bytes must exist in S3 and Garage.

Runs locally; credentials travel only through SSH stdin. Evidence is private.
"""
import json
import os
from pathlib import Path
import subprocess

MAIN = ['ssh', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-i',
        '/Users/xmedavid/.ssh/id_ed25519', 'root@internal.davidsbatista.com']
MAC = ['ssh', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-i',
       '/Users/xmedavid/.ssh/vectr', 'debian@192.168.0.236']
REMOTE = r'''
import boto3, hashlib, json, pathlib, subprocess, sys
from botocore.config import Config
c=json.load(sys.stdin)
root=pathlib.Path('/mnt/HC_Volume_104744479')
assert root.is_mount()
references=[]
def inspect(kind):
    ids=subprocess.check_output(['docker',kind,'ls','-q'],text=True).split()
    return json.loads(subprocess.check_output(['docker',kind,'inspect',*ids])) if ids else []
for kind in ('container','service','volume'):
    for item in inspect(kind):
        # Inspect only storage configuration, never log environment or credentials.
        fields=[item.get('Mounts',[]),item.get('Options',{}),
                item.get('Spec',{}).get('TaskTemplate',{}).get('ContainerSpec',{}).get('Mounts',[])]
        if '104744479' in json.dumps(fields) or 'upload_volume' in json.dumps(fields):
            references.append(kind+':'+item.get('Name',item.get('ID','unknown')))
assert not references, 'Docker storage reference remains'
cfg=Config(request_checksum_calculation='when_required',response_checksum_validation='when_required')
s3=boto3.client('s3',endpoint_url='https://fsn1.your-objectstorage.com',region_name='fsn1',aws_access_key_id=c['HETZNER_S3_ACCESS_KEY'],aws_secret_access_key=c['HETZNER_S3_SECRET_KEY'],config=cfg)
garage=boto3.client('s3',endpoint_url='http://100.75.57.44:3900',region_name='garage',aws_access_key_id=c['GARAGE_DEFAULT_ACCESS_KEY'],aws_secret_access_key=c['GARAGE_DEFAULT_SECRET_KEY'],config=Config(s3={'addressing_style':'path'},request_checksum_calculation='when_required',response_checksum_validation='when_required'))
bucket='pointfinder-prod-uploads-202609'
keys=[o['Key'] for p in garage.get_paginator('list_objects_v2').paginate(Bucket='pointfinder-recovery',Prefix='manifests/'+bucket+'/') for o in p.get('Contents',[])]
manifest_key=max(keys)
manifest=json.loads(garage.get_object(Bucket='pointfinder-recovery',Key=manifest_key)['Body'].read())
entries={}
for entry in manifest['entries']:
    if not entry['deleted']: entries.setdefault(entry['key'],[]).append(entry)
def digest(stream):
    h=hashlib.sha256()
    for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()
results=[]
for file in sorted((root/'uploads').rglob('*')):
    if not file.is_file():continue
    assert not file.is_symlink()
    key=file.relative_to(root/'uploads').as_posix()
    if key.split('/')[0].startswith('_'):continue
    before=file.stat()
    with file.open('rb') as f:sha=digest(f)
    with s3.get_object(Bucket=bucket,Key=key)['Body'] as f:assert digest(f)==sha,'S3 mismatch'
    candidates=[e for e in entries.get(key,[]) if e['sha256']==sha and e['size']==before.st_size]
    assert candidates,'Missing archive version'
    with garage.get_object(Bucket='pointfinder-recovery',Key=candidates[0]['archive_key'])['Body'] as f:assert digest(f)==sha,'Archive mismatch'
    assert file.stat().st_mtime_ns==before.st_mtime_ns
    results.append({'key':key,'bytes':before.st_size,'sha256':sha})
assert len(results)>=314,'Unexpected legacy inventory'
print(json.dumps({'verified':True,'files':results,'manifest':manifest_key,'bytes':sum(x['bytes'] for x in results),'docker_references':references}))
'''

def main():
    values={}
    for line in Path('/Users/xmedavid/.env').read_text().splitlines():
        key,sep,val=line.partition('=')
        if sep and key.strip() in ('HETZNER_S3_ACCESS_KEY','HETZNER_S3_SECRET_KEY'):
            values[key.strip()]=val.strip().strip('\"\'')
    raw=subprocess.check_output(MAC+['sudo cat /etc/dokploy/pointfinder/ha-secrets/garage.env'],text=True)
    values.update(dict(line.split('=',1) for line in raw.splitlines() if '=' in line))
    import shlex
    p=subprocess.run(MAIN+['/opt/pointfinder-s3-migration/bin/python -c '+shlex.quote(REMOTE)],input=json.dumps(values),capture_output=True,text=True)
    if p.returncode:raise SystemExit('Retirement audit failed; output withheld to protect credentials. No storage changed.')
    data=json.loads(p.stdout)
    os.umask(0o077)
    target=Path('/Users/xmedavid/.codex/pointfinder-ha-recovery/legacy-volume-final-audit.json')
    target.write_text(json.dumps(data))
    print(json.dumps({k:data[k] for k in ('verified','bytes','docker_references')}|{'files':len(data['files'])}))

if __name__=='__main__':main()
