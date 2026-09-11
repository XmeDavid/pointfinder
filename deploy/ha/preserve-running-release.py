"""Run as root on Hetzner before engine maintenance. Never emit service secrets."""
import datetime
import json
import os
import pathlib
import subprocess

def docker(*args):
    return subprocess.check_output(['docker', *args])

os.umask(0o077)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
directory = pathlib.Path('/var/backups/pointfinder-ha') / ('engine-' + stamp)
directory.mkdir(mode=0o700)
services = json.loads(docker('service', 'inspect', *docker('service', 'ls', '-q').decode().split()))
(directory / 'services.json').write_text(json.dumps(services))
containers = json.loads(docker('inspect', *docker('ps', '-q').decode().split()))
(directory / 'containers.json').write_text(json.dumps(containers))
for service in ('pointfinder-backend-v4djml', 'pointfinder-frontend-fvq5ug'):
    matching = [c for c in containers if c['Config'].get('Labels', {}).get('com.docker.swarm.service.name') == service]
    assert len(matching) == 1, 'Expected one running container on Hetzner'
    container = matching[0]
    spec = next(s for s in services if s['Spec']['Name'] == service)['Spec']
    assert set(spec['TaskTemplate']['ContainerSpec'].get('Env', [])).issubset(set(container['Config'].get('Env', []))), 'Runtime/env drift: stop maintenance'
    tag = service + ':ha-preserved-' + stamp.lower()
    docker('image', 'tag', container['Image'], tag)
    args = ['service', 'update', '--detach=false', '--no-resolve-image', '--image', tag]
    constraints = spec['TaskTemplate'].get('Placement', {}).get('Constraints', [])
    if not any(x.replace(' ', '') == 'node.hostname==davidsbatista' for x in constraints):
        args += ['--constraint-add', 'node.hostname == davidsbatista']
    result = subprocess.run(['docker', *args, service], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if result.returncode:
        raise SystemExit('Preserved-image update failed; inspect service before continuing')
    print(service + ' pinned to its running image and Hetzner', flush=True)
print('Protected maintenance inventory: ' + str(directory), flush=True)
