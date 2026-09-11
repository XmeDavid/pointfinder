"""One explicitly scoped Proxmox VM outage at a time, with automatic restart.

Physical Macs and other guests are never stopped. Requires Hetzner primary.
"""
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import uuid

name=sys.argv[1]
assert sys.argv[2:]==['--execute'] and name in {'arthur','rainer'}
node,vmid,expected={'arthur':('wadlow',200,'arthur'),'rainer':('rainer',102,'pointfinder-ha')}[name]
helper='/Users/xmedavid/.codex/skills/proxmox-cluster/scripts/proxmox_api.py'
base=f'/nodes/{node}/qemu/{vmid}'
main=['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ConnectTimeout=5',
      '-i','/Users/xmedavid/.ssh/id_ed25519','root@internal.davidsbatista.com']
def api(method,path):
    p=subprocess.run(['python3',helper,method,path],capture_output=True,text=True,timeout=35)
    if p.returncode:raise RuntimeError('Proxmox operation failed; output suppressed')
    return json.loads(p.stdout)['response']['data']
def action(operation):
    upid=api('POST',base+'/status/'+operation)
    deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        s=api('GET',f'/nodes/{node}/tasks/{upid}/status')
        if s['status']=='stopped':
            assert s.get('exitstatus')=='OK','VM task failed'
            print(json.dumps({'vm':expected,'action':operation,'status':'OK'}),flush=True)
            return
        time.sleep(2)
    raise RuntimeError('VM task deadline exceeded')
def probe(url):
    try:
        r=urllib.request.Request(url+'?ha_vm='+uuid.uuid4().hex,
            headers={'User-Agent':'PointFinder-Infrastructure-Check/1.0','Cache-Control':'no-cache'})
        with urllib.request.urlopen(r,timeout=5) as response:
            return response.status==200 and ('actuator' not in url or json.load(response).get('status')=='UP')
    except Exception:return False
urls=[f'https://{prefix}{domain}{path}' for domain in ['pointfinder.ch','pointfinder.pt']
      for prefix,path in [('', '/'),('api.','/actuator/health')]]
cfg=api('GET',base+'/config')
assert cfg['name']==expected
assert api('GET',base+'/status/current')['status']=='running'
p=subprocess.run(main+['docker exec pointfinder-pg-hetzner-vv3yw0-patroni-hetzner-1 psql -U scout -d pointfinder -Atc "SELECT pg_is_in_recovery();"'],capture_output=True,text=True,timeout=10)
assert p.returncode==0 and p.stdout.strip()=='f'
assert all(map(probe,urls))
report={'vm':expected,'vmid':vmid,'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'samples':[]}
start=time.monotonic()
stopped=False
try:
    stopped=True
    action('stop')
    assert api('GET',base+'/status/current')['status']=='stopped'
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        deadline=time.monotonic()+90
        consecutive=0
        while time.monotonic()<deadline:
            states=list(pool.map(probe,urls))
            report['samples'].append({'seconds':round(time.monotonic()-start,1),'healthy':states})
            consecutive=consecutive+1 if all(states) else 0
            if consecutive>=10:
                report['off_recovery_seconds']=round(time.monotonic()-start,1)
                report['result']='passed'
                print(json.dumps({'vm':expected,'stage':'all_endpoints_healthy_while_off','consecutive_rounds':10}),flush=True)
                break
            time.sleep(3)
        else:raise RuntimeError('Public recovery deadline exceeded')
except Exception as e:
    report['result']='failed';report['error_type']=type(e).__name__
finally:
    if stopped:
        status=api('GET',base+'/status/current')['status']
        if status=='stopped':action('start')
        elif status!='running':raise RuntimeError('Inspect uncertain VM state')
    report['final_vm_status']=api('GET',base+'/status/current')['status']
    os.umask(0o077)
    path=Path('/Users/xmedavid/.codex/pointfinder-ha-recovery')/('vm-outage-'+name+'-'+uuid.uuid4().hex[:8]+'.json')
    with path.open('x') as f:json.dump(report,f,indent=2)
    print(json.dumps({k:v for k,v in report.items() if k!='samples'}),flush=True)
if report.get('result')!='passed':sys.exit(1)
