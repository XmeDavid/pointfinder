"""Coordinated production rotation. Never print payloads or subprocess diagnostics.

Recovery material stays root-only on Hetzner. Re-runs reuse that material.
Only the three explicitly named backend variables are changed; no image build.
"""
import json
import pathlib
import shlex
import subprocess
import sys
from dokploy_api import call

APP = 'NTaYSoOkFkXakwG13jeAY'
PROJECT = 'o6PE4lw9B-qhAcd_8jVo6'
IMAGE = 'pointfinder-backend-v4djml:ha-preserved-20260909t170552z'
STATE = '/var/backups/pointfinder-ha/production-adoption/credential-rotation-20260909.json'
NODES = {
    'hetzner': ('root@internal.davidsbatista.com', 'id_ed25519', '',
                'pointfinder-pg-hetzner-vv3yw0-patroni-hetzner-1', '100.113.30.54'),
    'rainer': ('debian@192.168.0.236', 'vectr', 'sudo ',
               'pointfinder-pg-rainer-0u6pju-patroni-rainer-1', '100.75.57.44'),
}


def remote(node, code, payload=None):
    host, key, sudo, _, _ = NODES[node]
    result = subprocess.run([
        'ssh', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
        '-i', '/Users/xmedavid/.ssh/' + key, host,
        sudo + 'python3 -c ' + shlex.quote(code),
    ], input=json.dumps(payload), capture_output=True, text=True, timeout=55)
    if result.returncode:
        raise RuntimeError('Remote step failed on ' + node + '; diagnostics withheld')
    return json.loads(result.stdout)


DOCKER = '''
import http.client, socket, json, pathlib, os, sys
class Docker(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
  self.sock.connect('/var/run/docker.sock')
def docker(method,path,body=None):
 c=Docker('localhost'); c.request(method,path,json.dumps(body) if body is not None else None,{'Content-Type':'application/json'})
 r=c.getresponse(); data=r.read()
 if r.status>=300: raise RuntimeError('Docker request failed')
 return json.loads(data) if data else None
'''

PG = '''
import json, sys, pathlib, psycopg2
from psycopg2 import sql
p=json.load(sys.stdin)
standby=None
if p['action']=='rotate':
 c=psycopg2.connect(dbname='pointfinder',user='scout',host='127.0.0.1')
 c.autocommit=True
 with c.cursor() as cur:
  cur.execute('SELECT pg_is_in_recovery()'); standby=cur.fetchone()[0]
  assert not standby
  cur.execute('SHOW log_statement'); assert cur.fetchone()[0]=='none'
  cur.execute(sql.SQL('ALTER ROLE scout PASSWORD {}').format(sql.Literal(p['password'])))
elif p['action']=='verify':
  for password, expected in [(p['password'],True),(p['old'],False)]:
   try:
    test=psycopg2.connect(dbname='pointfinder',user='scout',host=p['address'],port=15432,password=password,connect_timeout=8)
    with test.cursor() as cur:
     cur.execute('SELECT pg_is_in_recovery()'); standby=cur.fetchone()[0]
    assert standby == p['standby']
    test.close(); accepted=True
   except psycopg2.OperationalError as error:
    assert 'password authentication failed' in str(error)
    accepted=False
   assert accepted == expected
print(json.dumps({'ok':True,'standby':standby}))
'''


def pg(node, payload):
    code = '''
import subprocess,json,sys
p=json.load(sys.stdin)
cmd=['docker','exec','-i',p['container'],'/opt/patroni/bin/python','-c',p['code']]
if p['payload']['action']=='verify':
 cmd=['docker','run','--rm','-i','--network','host','--entrypoint','/opt/patroni/bin/python','pointfinder-patroni:16.15-4.1.5-production-r1','-c',p['code']]
r=subprocess.run(cmd,input=json.dumps(p['payload']),capture_output=True,text=True,timeout=40)
assert r.returncode==0
print(r.stdout)
'''
    return remote(node, code, {'container': NODES[node][3], 'code': PG, 'payload': payload})


def parse(value):
    return {line.split('=', 1)[0]: line.split('=', 1)[1].strip().strip('\"\'')
            for line in (value or '').splitlines() if '=' in line and not line.startswith('#')}


def main():
    app = call('GET', 'application.one?applicationId=' + APP)
    project = call('GET', 'project.one?projectId=' + PROJECT)
    mail = parse(project.get('env')).get('MAIL_PASSWORD')
    assert mail and not mail.startswith('${')
    for node in NODES:
        remote(node, '''
import pathlib,json,subprocess
a=json.loads(pathlib.Path('/etc/dokploy/pointfinder/ha-secrets/patroni-auth.json').read_text())
assert a['superuser_username']=='scout'
p=json.load(__import__('sys').stdin)
r=subprocess.run(['docker','exec',p,'/opt/patroni/bin/python','-c','import psycopg2'],capture_output=True)
assert r.returncode==0
print('{"ready":true}')
''', NODES[node][3])
    state = remote('hetzner', DOCKER + '''
import secrets
p=json.load(sys.stdin); os.umask(0o077)
path=pathlib.Path(p['path'])
service=docker('GET','/services/pointfinder-backend-v4djml')
assert service['Spec']['TaskTemplate']['ContainerSpec']['Image']==p['image']
if path.exists():
 state=json.loads(path.read_text()); assert state['mail']==p['mail']
else:
 old=dict(e.split('=',1) for e in service['Spec']['TaskTemplate']['ContainerSpec']['Env'])
 assert old['MAIL_PASSWORD']!=p['mail']
 state={'password':secrets.token_urlsafe(48),'jwt':secrets.token_urlsafe(64),'mail':p['mail'],'old_password':old['SPRING_DATASOURCE_PASSWORD'],'old_service':service,'old_app_env':p['app_env']}
 with path.open('x') as f: json.dump(state,f)
print(json.dumps({k:state[k] for k in ['password','jwt','mail','old_password']}))
''', {'path': STATE, 'image': IMAGE, 'mail': mail, 'app_env': app['env']})
    print('Preflight passed; protected recovery material saved.', flush=True)
    pg('hetzner', {'action': 'rotate', 'password': state['password']})
    print('Primary database role rotated.', flush=True)
    for node in NODES:
        remote(node, '''
import pathlib,json,sys,subprocess,urllib.request,base64
p=json.load(sys.stdin)
path=pathlib.Path('/etc/dokploy/pointfinder/ha-secrets/patroni-auth.json')
auth=json.loads(path.read_text()); auth['superuser']=p['password']
with path.open('w') as f: json.dump(auth,f)
code="import pathlib,json,sys; p=pathlib.Path('/run/patroni/patroni.json'); c=json.loads(p.read_text()); c['postgresql']['authentication']['superuser']['password']=json.load(sys.stdin)['password']; p.write_text(json.dumps(c))"
r=subprocess.run(['docker','exec','-i',p['container'],'/opt/patroni/bin/python','-c',code],input=json.dumps({'password':p['password']}),capture_output=True,text=True)
assert r.returncode==0
token=base64.b64encode(('operator:'+auth['api']).encode()).decode()
req=urllib.request.Request('http://'+p['address']+':18008/reload',data=b'{}',headers={'Authorization':'Basic '+token,'Content-Type':'application/json'},method='POST')
with urllib.request.urlopen(req,timeout=10) as r: assert r.status==202
print('{"reloaded":true}')
''', {'password': state['password'], 'container': NODES[node][3], 'address': NODES[node][4]})
        print(node + ' Patroni credentials saved and reloaded.', flush=True)
    changes = {'SPRING_DATASOURCE_PASSWORD': state['password'], 'JWT_SECRET': state['jwt'],
               'MAIL_PASSWORD': '${{project.MAIL_PASSWORD}}'}
    # Re-fetch to avoid overwriting unrelated edits since preflight.
    current = call('GET', 'application.one?applicationId=' + APP)
    lines = current['env'].splitlines()
    assert all(sum(line.startswith(key + '=') for line in lines) == 1 for key in changes)
    env = '\n'.join(line.split('=', 1)[0] + '=' + changes[line.split('=', 1)[0]]
                    if line.split('=', 1)[0] in changes else line for line in lines)
    assert call('POST', 'application.update', {'applicationId': APP, 'env': env})
    changes['MAIL_PASSWORD'] = state['mail']
    remote('hetzner', DOCKER + '''
p=json.load(sys.stdin)
s=docker('GET','/services/pointfinder-backend-v4djml'); spec=s['Spec']; c=spec['TaskTemplate']['ContainerSpec']
assert c['Image']==p['image']
c['Env']=[e for e in c['Env'] if e.split('=',1)[0] not in p['values']]+[k+'='+v for k,v in p['values'].items()]
docker('POST','/services/'+s['ID']+'/update?version='+str(s['Version']['Index']),spec)
print('{"updated":true}')
''', {'image': IMAGE, 'values': changes})
    print('Saved environment and preserved-image runtime updated.', flush=True)
    for node in NODES:
        pg(node, {'action': 'verify', 'password': state['password'], 'old': state['old_password'],
                  'standby': node == 'rainer', 'address': NODES[node][4]})
        print(node + ': new database password accepted; old password rejected.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Rotation stopped (' + type(error).__name__ + '); sensitive diagnostics withheld.', file=sys.stderr)
        sys.exit(1)
