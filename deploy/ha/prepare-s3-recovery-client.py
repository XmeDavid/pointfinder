"""Send existing app upload credentials to the private recovery worker, silently."""
import json
import subprocess
from dokploy_api import call

project = call('GET', 'project.one?projectId=o6PE4lw9B-qhAcd_8jVo6')
values = {}
for line in (project.get('env') or '').splitlines():
    key, sep, value = line.partition('=')
    if sep and key.strip() in {'POINTFINDER_S3_ACCESS_KEY', 'POINTFINDER_S3_SECRET_KEY'}:
        values[key.strip()] = value.strip().strip('\"\'')
payload = {'access_key': values['POINTFINDER_S3_ACCESS_KEY'],
           'secret_key': values['POINTFINDER_S3_SECRET_KEY']}
code = '''import json,os,sys
from pathlib import Path
os.umask(0o077)
p=Path('/etc/dokploy/pointfinder/ha-secrets')
target=dict(line.split('=',1) for line in (p/'garage.env').read_text().splitlines() if '=' in line)
out=p/'recovery-client.json'
assert not out.exists(), 'Already prepared'
out.write_text(json.dumps({'source':json.load(sys.stdin),'target':{'access_key':target['GARAGE_DEFAULT_ACCESS_KEY'],'secret_key':target['GARAGE_DEFAULT_SECRET_KEY']}}))
Path('/srv/pointfinder-s3/snapshot-state').mkdir(mode=0o700,exist_ok=True)
'''
import shlex
subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-i',
                '/Users/xmedavid/.ssh/vectr', 'debian@192.168.0.236',
                'sudo python3 -c ' + shlex.quote(code)], input=json.dumps(payload),
               text=True, check=True)
print('Recovery client credentials prepared without display.')
