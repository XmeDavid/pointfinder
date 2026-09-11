"""Install protected backup inputs and deploy the reviewed Dokploy manifest."""
import json
import os
from pathlib import Path
import secrets
import shlex
import subprocess
import importlib.util
from dokploy_api import call

os.umask(0o077)
root=Path(__file__).parent
spec=importlib.util.spec_from_file_location('monitor',root/'deploy-external-monitor.py')
monitor=importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)
private=Path('/Users/xmedavid/.codex/pointfinder-ha-recovery/control-plane-backup.passphrase')
if not private.exists():
    private.write_text(secrets.token_urlsafe(48)+'\n')
private.chmod(0o600)
env={}
for line in Path('/Users/xmedavid/.env').read_text().splitlines():
    key,sep,value=line.partition('=')
    if sep:env[key.strip()]=value.strip().strip('\"\'')
s3={'endpoint':'https://fsn1.your-objectstorage.com','region':'fsn1',
    'access_key':env['HETZNER_S3_ACCESS_KEY'],'secret_key':env['HETZNER_S3_SECRET_KEY']}
payload={'passphrase':private.read_text(),'s3':s3}
script="""import json,os,sys
from pathlib import Path
os.umask(0o077)
v=json.load(sys.stdin)
p=Path('/etc/dokploy/pointfinder/ha-secrets')
p.mkdir(parents=True,exist_ok=True)
f=p/'control-plane-backup.passphrase';f.write_text(v['passphrase']);f.chmod(0o600)
if 's3' in v:
 f=p/'control-plane-s3.json';f.write_text(json.dumps(v['s3']));f.chmod(0o600)
 f=p/'control-plane-email.json';f.write_bytes((p/'alert-email.json').read_bytes());f.chmod(0o400)
 for name in ['control-plane-encrypted','control-plane-state','control-plane-alert-state']:
  d=Path('/var/backups/pointfinder-ha')/name;d.mkdir(parents=True,exist_ok=True);d.chmod(0o700)
"""
for host,values in [('hetzner',payload),('rainer',{'passphrase':payload['passphrase']})]:
    result=subprocess.run(monitor.SSH[host]+[('sudo ' if host=='rainer' else '')+'python3 -c '+shlex.quote(script)],input=json.dumps(values).encode(),capture_output=True)
    assert result.returncode==0,'Protected installation failed'
record=private.parent/'control-plane-compose-id'
if record.exists():cid=record.read_text().strip()
else:
    created=call('POST','compose.create',{'environmentId':'ulUK-fF-L-_ZO8e3RdxcV','name':'Dokploy encrypted backups','composeType':'docker-compose','sourceType':'raw','composeFile':(root/'control-plane-production.yml').read_text()})
    cid=created['composeId'];record.write_text(cid)
call('POST','compose.update',{'composeId':cid,'sourceType':'raw','composeFile':(root/'control-plane-production.yml').read_text()})
call('POST','compose.deploy',{'composeId':cid,'title':'Encrypted daily configuration backups and isolated monthly restore checks'})
print('Protected inputs installed on main host; recovery passphrase retained locally and on Mac. Deployment requested:',cid)
