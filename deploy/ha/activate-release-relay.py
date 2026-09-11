"""Prepare the fixed-target relay and an isolated frontend release canary.

Credentials stay in memory or protected files, never output. Does not enable CI
or deploy PointFinder production applications.
"""
import datetime
import json
import os
import pathlib
import shlex
import subprocess
import sys
from dokploy_api import call

ROOT = pathlib.Path('/Users/xmedavid/.codex/pointfinder-ha-recovery')
STATE = ROOT / 'release-activation.json'
RELAY = 'QEhQLas-iMl1aksHLb3pt'
FRONT = 'MhafmNK8-0-WsWqR-0IF5'
SSH = ['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-i',
       '/Users/xmedavid/.ssh/id_ed25519','root@internal.davidsbatista.com']

def main():
    os.umask(0o077)
    relay = call('GET','application.one?applicationId='+RELAY)
    assert relay['appName'] == 'infra-action-relay-jnsuti'
    front = call('GET','application.one?applicationId='+FRONT)
    assert front['sourceType'] == 'docker'
    if not STATE.exists():
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        (ROOT / ('before-relay-activation-'+stamp+'.json')).write_text(json.dumps(relay))
        canary = call('POST','application.create',{
            'name':'PointFinder release verification',
            'environmentId':'a0XtNKkJGVo6ojHQKkfjm',
            'description':'Temporary isolated frontend used to verify digest release correlation'})
        aid = canary['applicationId']
        STATE.write_text(json.dumps({'canaryId':aid,'frontendImage':front['dockerImage']}))
        call('POST','application.saveDockerProvider',{
            'applicationId':aid,'dockerImage':front['dockerImage'],
            'username':front.get('username'),'password':front.get('password'),
            'registryUrl':front.get('registryUrl')})
        call('POST','application.update',{'applicationId':aid,'sourceType':'docker',
            'autoDeploy':False,'replicas':1,'memoryLimit':'134217728','cpuLimit':'0.25',
            'placementSwarm':{'Constraints':['node.hostname==davidsbatista']}})
    state = json.loads(STATE.read_text())
    env = dict(line.split('=',1) for line in pathlib.Path('/Users/xmedavid/.env').read_text().splitlines()
               if '=' in line and not line.startswith('#'))
    key = env['DOKPLOY_API_KEY'].strip().strip('\"\'')
    installer = "import os,sys; from pathlib import Path; p=Path('/etc/dokploy/pointfinder/relay'); p.mkdir(mode=0o755,parents=True,exist_ok=True); f=p/'dokploy-api-key'; f.write_bytes(sys.stdin.buffer.read()); os.chown(f,0,65532); os.chmod(f,0o440)"
    subprocess.run(SSH+['python3 -c '+shlex.quote(installer)],input=key.encode(),
                   check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    mounts = relay.get('mounts',[])
    path = '/run/secrets/dokploy_api_key'
    found = [m for m in mounts if m['mountPath'] == path]
    assert len(found)<=1
    if not found:
        call('POST','mounts.create',{'type':'bind','serviceId':RELAY,'serviceType':'application',
            'hostPath':'/etc/dokploy/pointfinder/relay/dokploy-api-key','mountPath':path})
    else:
        assert found[0]['hostPath']=='/etc/dokploy/pointfinder/relay/dokploy-api-key'
    updates = {'RELEASE_ENABLED':'true','DOKPLOY_API_BASE_URL':'http://dokploy:3000/api',
        'DOKPLOY_API_KEY_FILE':path,
        'RELEASE_TARGET_POINTFINDER_BACKEND':'NTaYSoOkFkXakwG13jeAY|ghcr.io/xmedavid/pointfinder-backend',
        'RELEASE_TARGET_POINTFINDER_FRONTEND':FRONT+'|ghcr.io/xmedavid/pointfinder-frontend',
        'RELEASE_TARGET_POINTFINDER_RELEASE_CHECK':state['canaryId']+'|ghcr.io/xmedavid/pointfinder-frontend'}
    removed = {'DEPLOY_TARGET_POINTFINDER_BACKEND','DEPLOY_TARGET_POINTFINDER_FRONTEND'}
    lines = [line for line in relay.get('env','').splitlines()
             if line.partition('=')[0] not in set(updates)|removed]
    newenv = '\n'.join(lines+[k+'='+v for k,v in updates.items()])+'\n'
    call('POST','application.update',{'applicationId':RELAY,'env':newenv})
    after = call('GET','application.one?applicationId='+RELAY)
    assert after['env']==newenv
    call('POST','application.deploy',{'applicationId':RELAY,
        'title':'Enable CI-gated immutable releases'})
    print('Relay deployment requested; canary:',state['canaryId'])
    print('Production CI remains disabled. Legacy PointFinder bypass routes removed; unrelated routes preserved.')

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('Activation failed:',type(exc).__name__,file=sys.stderr)
        raise SystemExit(1)
