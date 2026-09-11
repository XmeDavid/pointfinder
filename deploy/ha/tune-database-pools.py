"""Run on Hetzner: preserve production release/env, tune pool idle traffic only."""
import datetime
import json
import os
from pathlib import Path
import subprocess

service = 'pointfinder-backend-v4djml'
current = json.loads(subprocess.check_output(['docker', 'service', 'inspect', service]))[0]
image = current['Spec']['TaskTemplate']['ContainerSpec']['Image']
assert image.split('@')[-1] == 'sha256:8158617142bb81e38936730abbd6dd81fca5efa1e37a627d86faf3174a8b665a'
assert current['Spec']['Mode']['Replicated']['Replicas'] == 2
assert current['Spec']['UpdateConfig']['Order'] == 'stop-first'
os.umask(0o077)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = Path('/var/backups/pointfinder-ha/production-adoption') / ('before-pool-tuning-' + stamp + '.json')
with backup.open('x') as stream:
    json.dump(current, stream)
subprocess.run(['docker', 'service', 'update', '--detach=true',
    '--env-add', 'SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE=2',
    '--env-add', 'SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=20',
    '--env-add', 'SPRING_DATASOURCE_HIKARI_KEEPALIVE_TIME=60000',
    '--env-add', 'SPRING_DATASOURCE_HIKARI_MAX_LIFETIME=600000', service], check=True)
print('Pool tuning requested; original image and other runtime environment preserved.')
