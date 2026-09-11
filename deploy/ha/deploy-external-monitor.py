"""Install the reviewed external monitor with existing account/email access.

All credentials remain in memory, protected recovery files, or SSH stdin.
Does not enable a paid plan or modify application ingress.
"""
import json
import os
from pathlib import Path
import secrets
import shlex
import subprocess
import sys
from cloudflare_api import call, upload_worker

NAME='pointfinder-infra-monitor'
DB='b2061d61-7651-4542-9465-94491218e142'
ROOT=Path(__file__).parent/'external-monitor'
PRIVATE=Path('/Users/xmedavid/.codex/pointfinder-ha-recovery/external-monitor-secrets.json')
SSH={
 'hetzner':['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-i','/Users/xmedavid/.ssh/id_ed25519','root@internal.davidsbatista.com'],
 'arthur':['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','HostKeyAlias=arthur.tailae61a2.ts.net','-i','/Users/xmedavid/.ssh/vectr','root@arthur'],
 'rainer':['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-i','/Users/xmedavid/.ssh/vectr','debian@192.168.0.236'],
}

def main():
    os.umask(0o077)
    if sys.argv[1]=='status':
        for sql in ['SELECT * FROM meta','SELECT host,last_seen_ms,count FROM heartbeats','SELECT id,state,reason FROM checks','SELECT emails_sent,last_email_ms FROM incident']:
            data=call('POST','/d1/database/'+DB+'/query',{'sql':sql})
            print(json.dumps([r.get('results',[]) for r in data]))
        return
    assert sys.argv[1]=='deploy'
    if PRIVATE.exists():values=json.loads(PRIVATE.read_text())
    else:
        values={'tokens':{host:secrets.token_hex(32) for host in SSH}}
        PRIVATE.write_text(json.dumps(values))
    mail=json.loads(subprocess.check_output(SSH['hetzner']+['cat /etc/dokploy/pointfinder/ha-secrets/alert-email.json']))
    assert mail['to']==['mail@davidsbatista.com']
    result=call('POST','/d1/database/'+DB+'/query',{'sql':(ROOT/'worker/schema.sql').read_text()})
    assert all(x.get('success') for x in result),'D1 schema rejected'
    bindings=[{'type':'d1','name':'DB','id':DB}]
    for key,value in {'HEARTBEAT_TOKENS':json.dumps(values['tokens']),'RESEND_API_KEY':mail['api_key'],'ALERT_FROM':mail['from'],'ALERT_TO':mail['to'][0]}.items():
        bindings.append({'type':'secret_text','name':key,'text':value})
    modules={p.name:p.read_bytes() for p in (ROOT/'worker/src').glob('*.mjs')}
    result=upload_worker(NAME,modules,{'main_module':'index.mjs','compatibility_date':'2026-09-10','bindings':bindings,'observability':{'enabled':True}})
    print('Worker uploaded:',result.get('id'))
    call('POST','/workers/scripts/'+NAME+'/subdomain',{'enabled':True,'previews_enabled':False})
    call('PUT','/workers/scripts/'+NAME+'/schedules',[{'cron':'*/5 * * * *'}])
    installer="import os,sys;from pathlib import Path;os.umask(0o077);p=Path('/etc/dokploy/pointfinder/ha-secrets/heartbeat.json');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(sys.stdin.buffer.read());os.chown(p,999,999);p.chmod(0o400)"
    for host,ssh in SSH.items():
        p=subprocess.run(ssh+[('sudo ' if host=='rainer' else '')+'python3 -c '+shlex.quote(installer)],input=json.dumps({'token':values['tokens'][host]}).encode(),capture_output=True)
        assert p.returncode==0,'Heartbeat secret installation failed'
    print('Five-minute cron configured; protected per-host heartbeat secrets installed. No paid plan changes.')

if __name__=='__main__':
    try:main()
    except Exception as e:raise SystemExit('External monitor deployment failed: '+type(e).__name__) from None
