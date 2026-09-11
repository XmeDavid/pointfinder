"""Register the existing VM with Dokploy; never run the Swarm installer."""
import json
import subprocess
from dokploy_api import call

ADDRESS = '100.75.57.44'
KEY_ID = '7HM16LrPr_nPRoSQJZzur'
key = call('GET', 'sshKey.one?sshKeyId=' + KEY_ID)['publicKey'].strip()
assert '\n' not in key and key.startswith(('ssh-ed25519 ', 'ssh-rsa '))
remote = '''import pathlib,sys,json,os
key=json.load(sys.stdin)
directory=pathlib.Path('/root/.ssh')
directory.mkdir(mode=0o700,exist_ok=True)
path=directory/'authorized_keys'
existing=path.read_text() if path.exists() else ''
line='from="100.113.30.54",no-agent-forwarding,no-port-forwarding,no-X11-forwarding '+key
if line not in existing.splitlines():
    os.umask(0o077)
    with path.open('a') as out:
        out.write(('\\n' if existing and not existing.endswith('\\n') else '')+line+'\\n')
os.chmod(path,0o600)
'''
import shlex
subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-i',
                '/Users/xmedavid/.ssh/vectr', 'debian@192.168.0.236',
                'sudo python3 -c ' + shlex.quote(remote)],
               input=json.dumps(key).encode(), check=True)
matches = [s for s in call('GET', 'server.all') if s.get('ipAddress') == ADDRESS]
assert len(matches) <= 1, 'Duplicate registrations; inspect before continuing'
server = matches[0] if matches else call('POST', 'server.create', {
    'name': 'PointFinder HA (Rainer)', 'description': 'Existing VM 102; joined Swarm. Do not run server setup.',
    'ipAddress': ADDRESS, 'port': 22, 'username': 'root', 'sshKeyId': KEY_ID,
    'serverType': 'deploy', 'enableDockerCleanup': False,
})
print(json.dumps({k:server.get(k) for k in ('serverId','name','serverStatus')}))
