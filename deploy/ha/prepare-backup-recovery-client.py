"""Stage the existing general S3 credentials for encrypted backup replication.

Never displays secrets; refuses to replace a different protected configuration.
"""
import json
from pathlib import Path
import shlex
import subprocess


def main():
    values = {}
    for line in Path('/Users/xmedavid/.env').read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep and key.strip() in {'HETZNER_S3_ACCESS_KEY', 'HETZNER_S3_SECRET_KEY'}:
            values[key.strip()] = value.strip().strip('\"\'')
    payload = {'access_key': values['HETZNER_S3_ACCESS_KEY'],
               'secret_key': values['HETZNER_S3_SECRET_KEY']}
    code = '''import json,os,sys
from pathlib import Path
os.umask(0o077)
p=Path('/etc/dokploy/pointfinder/ha-secrets')
target=json.loads((p/'recovery-client.json').read_text())['target']
data={'source':json.load(sys.stdin),'target':target}
out=p/'backup-recovery-client.json'
if out.exists():
    assert json.loads(out.read_text())==data, 'Existing configuration differs'
else:
    with out.open('x') as f: json.dump(data,f)
os.chmod(out,0o600)
Path('/srv/pointfinder-s3/backup-snapshot-state').mkdir(mode=0o700,exist_ok=True)
'''
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
        '-i', '/Users/xmedavid/.ssh/vectr', 'debian@192.168.0.236',
        'sudo python3 -c ' + shlex.quote(code)], input=json.dumps(payload),
        text=True, capture_output=True)
    if result.returncode:
        raise SystemExit('Backup recovery credential staging failed; output suppressed')
    print('Protected backup recovery credentials prepared.')


if __name__ == '__main__':
    main()
