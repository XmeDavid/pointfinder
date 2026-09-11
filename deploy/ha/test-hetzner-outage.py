"""Explicit maintenance-window hard power-loss drill, with bounded power-on.

Only server 114836804 is in scope. Never publishes API credentials or raw API
errors. Synthetic data lives in a unique schema and is removed after recovery.
No production container/service definitions are changed by this exercise.
"""
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.request
import uuid

SERVER = 114836804
SSH = ['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ConnectTimeout=5']
MAIN = SSH + ['-i','/Users/xmedavid/.ssh/id_ed25519','root@internal.davidsbatista.com']
MAC = SSH + ['-i','/Users/xmedavid/.ssh/vectr','debian@192.168.0.236']
PG = {'main':'pointfinder-pg-hetzner-vv3yw0-patroni-hetzner-1',
      'mac':'pointfinder-pg-rainer-0u6pju-patroni-rainer-1'}
stop = threading.Event()
samples = []
started = time.monotonic()
schema = 'ha_rehearsal_' + uuid.uuid4().hex[:12]
report = {'schema':schema,'started':datetime.datetime.now(datetime.timezone.utc).isoformat()}
token = None
for line in Path('/Users/xmedavid/.env').read_text().splitlines():
    key, sep, value = line.partition('=')
    if sep and key.strip() == 'HETZNER_API_KEY': token=value.strip().strip('\"\'')
assert token and '\n' not in token and '"' not in token

def cloud(method, path):
    p = subprocess.run(['curl','--silent','--show-error','--fail','--max-time','20',
        '--config','-','--request',method,'https://api.hetzner.cloud/v1'+path],
        input='header = "Authorization: Bearer '+token+'"\n',capture_output=True,text=True,timeout=25)
    if p.returncode: raise RuntimeError('Cloud API request failed; details suppressed')
    return json.loads(p.stdout)

def action(operation):
    assert operation in {'poweroff','poweron'}
    a=cloud('POST',f'/servers/{SERVER}/actions/{operation}')['action']
    ident=a['id']
    deadline=time.monotonic()+75
    while a['status']=='running' and time.monotonic()<deadline:
        time.sleep(2)
        a=cloud('GET',f'/servers/{SERVER}/actions/{ident}')['action']
    assert a['status']=='success', operation+' action not successful'
    print(json.dumps({'action':operation,'action_id':ident,'status':a['status']}),flush=True)

def sql(host, query, timeout=15):
    prefix=MAIN if host=='main' else MAC
    sudo='' if host=='main' else 'sudo '
    p=subprocess.run(prefix+[sudo+'docker exec -i '+PG[host]+
        ' psql -v ON_ERROR_STOP=1 -U scout -d pointfinder -At'],
        input=query,text=True,capture_output=True,timeout=timeout)
    if p.returncode: raise RuntimeError('SQL check failed on '+host)
    return p.stdout.strip()

def probe(url):
    ok=False
    try:
        req=urllib.request.Request(url+'?ha_check='+uuid.uuid4().hex,
            headers={'User-Agent':'PointFinder-Infrastructure-Check/1.0','Cache-Control':'no-cache'})
        with urllib.request.urlopen(req,timeout=5) as response:
            ok=response.status==200
            if '/actuator/health' in url: ok=ok and json.load(response).get('status')=='UP'
    except Exception: pass
    return {'url':url,'seconds':round(time.monotonic()-started,1),'ok':ok}

URLS=[f'https://{prefix}{domain}{path}' for domain in ['pointfinder.ch','pointfinder.pt']
      for prefix,path in [('', '/'),('api.','/actuator/health')]]
def monitor():
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        while not stop.is_set():
            samples.extend(pool.map(probe,URLS))
            stop.wait(2)

def wait_sql(host, query, expected, seconds):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        try:
            if sql(host,query)==expected: return
        except Exception: pass
        time.sleep(3)
    raise RuntimeError('Timed out waiting for database state on '+host)

assert sys.argv[1:]==['--execute'], 'Requires explicit --execute maintenance action'
server=cloud('GET',f'/servers/{SERVER}')['server']
assert server['id']==SERVER and server['name']=='dokploy-master' and server['status']=='running'
assert sql('main','SELECT pg_is_in_recovery();')=='f'
assert sql('mac','SELECT pg_is_in_recovery();')=='t'
assert sql('main','SELECT system_identifier FROM pg_control_system();')=='7605372262247206949'
assert sql('mac','SELECT system_identifier FROM pg_control_system();')=='7605372262247206949'
assert all(s['ok'] for s in map(probe,URLS)), 'Public baseline unhealthy'
sql('main',f'CREATE SCHEMA {schema}; CREATE TABLE {schema}.probe (id int primary key, value int); INSERT INTO {schema}.probe VALUES (1,1);')
wait_sql('mac',f'SELECT value FROM {schema}.probe WHERE id=1;','1',30)
thread=threading.Thread(target=monitor,daemon=True)
thread.start()
power_attempted=False
try:
    time.sleep(5)
    power_attempted=True
    report['poweroff_seconds']=round(time.monotonic()-started,1)
    action('poweroff')
    assert cloud('GET',f'/servers/{SERVER}')['server']['status']=='off'
    wait_sql('mac','SELECT pg_is_in_recovery();','f',150)
    report['promoted_seconds']=round(time.monotonic()-started,1)
    assert sql('mac',f'UPDATE {schema}.probe SET value=2 WHERE id=1 RETURNING value;').splitlines()[0]=='2'
    print(json.dumps({'stage':'mac_promoted_and_writable','seconds':report['promoted_seconds']}),flush=True)
    deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        if all(s['ok'] for s in map(probe,URLS)):
            report['public_recovered_seconds']=round(time.monotonic()-started,1)
            break
        time.sleep(3)
    else:
        raise RuntimeError('Public endpoints did not recover within 90s of promotion')
    for n in range(6):
        batch=list(map(probe,URLS))
        assert all(s['ok'] for s in batch), 'Public recovery check failed'
        print(json.dumps({'stage':'public_healthy_with_hetzner_off','round':n+1}),flush=True)
        time.sleep(5)
    report['outage_result']='passed'
except Exception as error:
    report['outage_result']='failed'
    report['error_type']=type(error).__name__
    print(json.dumps({'stage':'outage_failed','error_type':type(error).__name__}),flush=True)
finally:
    if power_attempted:
        # Read current state before another mutation; never blindly repeat an
        # uncertain power-off operation.
        status=cloud('GET',f'/servers/{SERVER}')['server']['status']
        if status=='off': action('poweron')
        elif status!='running':
            stop.set()
            raise RuntimeError('Server power state needs inspection: '+status)
        report['poweron_seconds']=round(time.monotonic()-started,1)
    try:
        wait_sql('main','SELECT pg_is_in_recovery();','t',240)
        wait_sql('main',f'SELECT value FROM {schema}.probe WHERE id=1;','2',90)
        assert sql('mac','SELECT pg_is_in_recovery();')=='f'
        sql('mac',f'DROP TABLE {schema}.probe; DROP SCHEMA {schema};')
        report['former_primary_rejoined']='passed'
        report['fixture_cleaned']=True
        print(json.dumps({'stage':'former_primary_rejoined_as_replica','fixture_cleaned':True}),flush=True)
    except Exception as error:
        report['former_primary_rejoined']='failed'
        report['rejoin_error_type']=type(error).__name__
    stop.set()
    thread.join(timeout=10)
    report['samples']=samples
    report['summary']={url:{'probes':len([s for s in samples if s['url']==url]),
        'failures':len([s for s in samples if s['url']==url and not s['ok']])} for url in URLS}
    os.umask(0o077)
    out=Path('/Users/xmedavid/.codex/pointfinder-ha-recovery')/(schema+'-outage.json')
    with out.open('x') as stream: json.dump(report,stream,indent=2)
    print(json.dumps({k:v for k,v in report.items() if k!='samples'}),flush=True)
if report.get('outage_result')!='passed' or report.get('former_primary_rejoined')!='passed': sys.exit(1)
