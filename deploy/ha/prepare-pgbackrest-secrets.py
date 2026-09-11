"""Stage pgBackRest secrets using the user-authorized existing general S3 key.

No credentials are printed. Refuses to overwrite existing remote configuration.
The protected local copy preserves the encryption passphrase for recovery.
"""
import hashlib
import os
from pathlib import Path
import secrets
import shlex
import subprocess
from s3_storage import client, BUCKETS

def main():
    os.umask(0o077)
    values = {}
    for line in Path('/Users/xmedavid/.env').read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep and key.strip() in {'HETZNER_S3_ACCESS_KEY', 'HETZNER_S3_SECRET_KEY'}:
            values[key.strip()] = value.strip().strip('\"\'')
    s3 = client()
    s3.head_bucket(Bucket=BUCKETS[1])
    s3.list_objects_v2(Bucket=BUCKETS[1], MaxKeys=1)
    recovery = Path('/Users/xmedavid/.codex/pointfinder-ha-recovery')
    recovery.mkdir(mode=0o700, exist_ok=True)
    path = recovery / 'pgbackrest.conf'
    if path.exists():
        config = path.read_text()
        assert 'repo1-s3-key=' + values['HETZNER_S3_ACCESS_KEY'] + '\n' in config
        assert 'repo1-s3-key-secret=' + values['HETZNER_S3_SECRET_KEY'] + '\n' in config
    else:
        config = Path(__file__).with_name('pgbackrest').joinpath('pgbackrest.conf.example').read_text()
        config = config.replace('REPLACE_WITH_BACKUP_ONLY_ACCESS_KEY', values['HETZNER_S3_ACCESS_KEY'])
        config = config.replace('REPLACE_WITH_BACKUP_ONLY_SECRET_KEY', values['HETZNER_S3_SECRET_KEY'])
        config = config.replace('REPLACE_WITH_LONG_RANDOM_PASSPHRASE', secrets.token_hex(48))
        assert 'REPLACE_' not in '\n'.join(line for line in config.splitlines() if not line.startswith('#'))
        with path.open('x') as handle:
            handle.write(config)
    os.chmod(path, 0o600)
    code = '''import hashlib,os,sys
from pathlib import Path
os.umask(0o077)
data=sys.stdin.buffer.read()
directory=Path('/etc/dokploy/pointfinder/ha-secrets')
assert directory.is_dir()
for name,owner,mode in [('pgbackrest.conf',0,0o600),('pgbackrest-postgres.conf',999,0o400)]:
    path=directory/name
    if path.exists():
        assert path.read_bytes()==data, 'Existing backup config differs; refusing overwrite'
    else:
        with path.open('xb') as handle: handle.write(data)
    os.chown(path,owner,owner)
    os.chmod(path,mode)
assert all((directory/name).read_bytes()==data for name in ['pgbackrest.conf','pgbackrest-postgres.conf'])
print('Protected backup configuration verified.')
'''
    targets = [('/Users/xmedavid/.ssh/id_ed25519', 'root@internal.davidsbatista.com', ''),
               ('/Users/xmedavid/.ssh/vectr', 'debian@192.168.0.236', 'sudo ')]
    for identity, host, sudo in targets:
        result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
                                 '-i', identity, host, sudo + 'python3 -c ' + shlex.quote(code)],
                                input=config, text=True, capture_output=True)
        if result.returncode:
            raise SystemExit('Backup configuration staging failed; remote output suppressed')
        assert result.stdout.strip() == 'Protected backup configuration verified.'
        print('Backup configuration staged and verified on ' + host.split('@')[1])
    print('Existing general S3 key can access backups; permissions were not changed.')

if __name__ == '__main__':
    main()
