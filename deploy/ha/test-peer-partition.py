"""Observe former-primary fencing under a bounded Hetzner/Mac peer partition.

Requires the maintenance window, healthy primary Hetzner/standby Rainer, and
the root-owned /run/pointfinder-partition-control.py helper already installed.
No secrets are needed or read by this script. No production data is modified.
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

assert sys.argv[1:]==['--execute']
base=['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ConnectTimeout=3']
main=base+['-i','/Users/xmedavid/.ssh/id_ed25519','root@internal.davidsbatista.com']
mac=base+['-i','/Users/xmedavid/.ssh/vectr','debian@192.168.0.236']
chain='PFHA_'+uuid.uuid4().hex[:12]
start=time.monotonic()
report={'partition':chain,'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'samples':[]}

def remote(target,cmd,timeout=8):
    p=subprocess.run(target+[cmd],capture_output=True,text=True,timeout=timeout)
    if p.returncode: raise RuntimeError('Remote check failed')
    return p.stdout.strip()
def role(host):
    target,cid,sudo=(main,'pointfinder-pg-hetzner-vv3yw0-patroni-hetzner-1','') if host=='main' else (mac,'pointfinder-pg-rainer-0u6pju-patroni-rainer-1','sudo ')
    try:
        result=remote(target,sudo+'docker exec '+cid+' psql -U scout -d pointfinder -Atc "SELECT pg_is_in_recovery();"')
        return {'f':'primary','t':'replica'}.get(result,'unknown')
    except Exception: return 'unreachable'
def public():
    for domain in ['pointfinder.ch','pointfinder.pt']:
        try:
            req=urllib.request.Request('https://api.'+domain+'/actuator/health?ha_partition='+uuid.uuid4().hex,
                headers={'User-Agent':'PointFinder-Infrastructure-Check/1.0','Cache-Control':'no-cache'})
            with urllib.request.urlopen(req,timeout=5) as r:
                if r.status!=200 or json.load(r).get('status')!='UP': return False
        except Exception: return False
    return True

assert role('main')=='primary' and role('mac')=='replica' and public()
before_boot=remote(main,'cat /proc/sys/kernel/random/boot_id')
armed=False
try:
    armed=True
    remote(main,'python3 /run/pointfinder-partition-control.py apply '+chain,timeout=15)
    report['applied_seconds']=round(time.monotonic()-start,1)
    print(json.dumps({'partition':chain,'stage':'applied','rollback_seconds':150}),flush=True)
    promoted_at=None
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        deadline=time.monotonic()+130
        while time.monotonic()<deadline:
            roles=list(pool.map(role,['main','mac']))
            sample={'seconds':round(time.monotonic()-start,1),'main':roles[0],'mac':roles[1]}
            report['samples'].append(sample)
            print(json.dumps(sample),flush=True)
            assert roles!=['primary','primary'],'Both sides report writable primary'
            if roles[1]=='primary':
                if promoted_at is None:
                    promoted_at=time.monotonic()
                    report['promoted_seconds']=sample['seconds']
                    assert roles[0]!='primary'
                if time.monotonic()-promoted_at>25 and public():
                    report['public_recovered_seconds']=round(time.monotonic()-start,1)
                    report['result']='passed'
                    break
            time.sleep(3)
        else: raise RuntimeError('Partition recovery deadline exceeded')
except Exception as e:
    report['result']='failed'
    report['error_type']=type(e).__name__
finally:
    if armed:
        try:
            remote(main,'python3 /run/pointfinder-partition-control.py rollback '+chain,timeout=15)
            report['rollback']='removed'
        except Exception:
            report['rollback']='await automatic rollback or reboot'
    # A watchdog reset can remove /run helper as well as the firewall rules.
    deadline=time.monotonic()+180
    while time.monotonic()<deadline:
        try:
            rules=remote(main,'iptables -S')
            if chain not in rules and role('main')=='replica' and role('mac')=='primary':
                report['rejoined']=True
                report['watchdog_reboot']=remote(main,'cat /proc/sys/kernel/random/boot_id')!=before_boot
                break
        except Exception: pass
        time.sleep(3)
    else: report['rejoined']=False
    os.umask(0o077)
    path=Path('/Users/xmedavid/.codex/pointfinder-ha-recovery')/(chain+'-partition.json')
    with path.open('x') as f:json.dump(report,f,indent=2)
    print(json.dumps({k:v for k,v in report.items() if k!='samples'}),flush=True)
if report.get('result')!='passed' or not report.get('rejoined'):sys.exit(1)
