"""Run as root on Rainer only. Generate credentials without displaying them."""
import os
from pathlib import Path
import secrets
import subprocess

def main():
    os.umask(0o077)
    mount = subprocess.check_output(['findmnt', '-n', '-o', 'UUID', '--target',
                                     '/srv/pointfinder-s3'], text=True).strip()
    assert mount == 'a90df539-c996-4afe-b939-6b9f05cbff10', 'Recovery disk is not mounted'
    directory = Path('/etc/dokploy/pointfinder/ha-secrets')
    assert directory.is_dir(), 'Wrong host or missing HA setup'
    config = directory / 'garage.toml'
    env = directory / 'garage.env'
    assert not config.exists() and not env.exists(), 'Already prepared; do not rotate in place'
    (Path('/srv/pointfinder-s3') / 'garage').mkdir(mode=0o700)
    config.write_text('''metadata_dir = "/data/meta"
data_dir = "/data/objects"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "127.0.0.1:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "''' + secrets.token_hex(32) + '''"
[s3_api]
s3_region = "garage"
api_bind_addr = "0.0.0.0:3900"
''')
    env.write_text('GARAGE_DEFAULT_ACCESS_KEY=GK' + secrets.token_hex(16)
                   + '\nGARAGE_DEFAULT_SECRET_KEY=' + secrets.token_hex(32)
                   + '\nGARAGE_DEFAULT_BUCKET=pointfinder-recovery\nRUST_LOG=warn\n')
    print('Garage recovery configuration prepared; credentials kept root-only.')

if __name__ == '__main__':
    main()
