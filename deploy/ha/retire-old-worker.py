"""Retire the audited old worker only, after TeamSpeak migration confirmation.

API authorization is supplied through curl stdin, never argv or tool output.
Protected backups of TeamSpeak exist on Hetzner and Rainer; no attached volumes.
"""
import json, os, pathlib, subprocess, time

token=None
for line in pathlib.Path('/Users/xmedavid/.env').read_text().splitlines():
    key,sep,value=line.partition('=')
    if sep and key.strip()=='HETZNER_API_KEY':token=value.strip().strip('\"\'')
assert token and all(c.isalnum() or c in '_-' for c in token)
def api(method,path,allow_missing=False):
    config='url = "https://api.hetzner.cloud/v1'+path+'"\nrequest = "'+method+'"\nheader = "Authorization: Bearer '+token+'"\n'
    p=subprocess.run(['curl','--silent','--show-error','--fail-with-body','--max-time','30','--config','-'],input=config,capture_output=True,text=True)
    data=json.loads(p.stdout) if p.stdout else {}
    if p.returncode:
        if allow_missing and data.get('error',{}).get('code')=='not_found':return None
        raise RuntimeError('Hetzner request failed; response withheld')
    return data

server=api('GET','/servers/120211056')['server']
assert server['name']=='dokploy-worker-1' and server['volumes']==[]
assert server['public_net']['ipv4']['id']==99347551
ip=api('GET','/primary_ips/99347551')['primary_ip']
assert ip['assignee_id']==server['id'] and ip['ip']=='188.245.252.20'
os.umask(0o077)
p=pathlib.Path('/Users/xmedavid/.codex/pointfinder-ha-recovery/retired-worker-metadata.json')
assert not p.exists(), 'Retirement already started; inspect before resuming'
p.write_text(json.dumps({'server':server,'primary_ip':ip}))
result=api('DELETE','/servers/120211056')
if result.get('action'):
    action=result['action']['id']
    for _ in range(20):
        state=api('GET','/actions/'+str(action))['action']['status']
        if state=='success':break
        if state=='error':raise RuntimeError('Server deletion action failed')
        time.sleep(1)
    else:raise RuntimeError('Deletion still pending; inspect action')
assert api('GET','/servers/120211056',True) is None
print('Old worker 120211056 deleted; preserved TeamSpeak backups remain',flush=True)
ip=api('GET','/primary_ips/99347551')['primary_ip']
assert ip['assignee_id'] is None and ip['ip']=='188.245.252.20'
api('DELETE','/primary_ips/99347551')
assert api('GET','/primary_ips/99347551',True) is None
print('Separately billed IPv4 99347551 deleted',flush=True)
