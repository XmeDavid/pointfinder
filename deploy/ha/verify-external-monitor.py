"""Run one real monitoring cycle through a temporary authenticated route.

The route and its random credential are removed in finally. No synthetic
outage is introduced. This does not prove that Cloudflare cron is firing.
"""
import importlib.util
import json
from pathlib import Path
import secrets
import subprocess
import time
import urllib.error
import urllib.request
from cloudflare_api import call, upload_worker

root=Path(__file__).parent
spec=importlib.util.spec_from_file_location('installer',root/'deploy-external-monitor.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
values=json.loads(m.PRIVATE.read_text())
mail=json.loads(subprocess.check_output(m.SSH['hetzner']+['cat /etc/dokploy/pointfinder/ha-secrets/alert-email.json']))
bindings=[{'type':'d1','name':'DB','id':m.DB}]
for key,value in {'HEARTBEAT_TOKENS':json.dumps(values['tokens']),'RESEND_API_KEY':mail['api_key'],'ALERT_FROM':mail['from'],'ALERT_TO':mail['to'][0]}.items():
    bindings.append({'type':'secret_text','name':key,'text':value})
modules={p.name:p.read_bytes() for p in (m.ROOT/'worker/src').glob('*.mjs')}
metadata={'main_module':'index.mjs','compatibility_date':'2026-09-10','bindings':bindings,'observability':{'enabled':True}}
token=secrets.token_urlsafe(48)
temporary=dict(modules)
source=temporary['index.mjs'].decode()
needle='  fetch(request, env) {\n    return handleRequest(request, env);'
assert needle in source
source=source.replace(needle,"""  async fetch(request, env) {
    if (new URL(request.url).pathname === '/installation-check' && request.method === 'POST'
        && request.headers.get('authorization') === 'Bearer ' + env.INSTALL_CHECK_TOKEN) {
      return Response.json(await runCycle(env));
    }
    return handleRequest(request, env);""")
temporary['index.mjs']=source.encode()
try:
    upload_worker(m.NAME,temporary,{**metadata,'bindings':bindings+[{'type':'secret_text','name':'INSTALL_CHECK_TOKEN','text':token}]})
    req=urllib.request.Request('https://'+m.NAME+'.xmedavid.workers.dev/installation-check',data=b'',method='POST',headers={'Authorization':'Bearer '+token,'User-Agent':'pointfinder-uptime-monitor/1'})
    for attempt in range(12):
        try:
            with urllib.request.urlopen(req,timeout=30) as response:
                result=json.load(response)
            break
        except urllib.error.HTTPError as error:
            if error.code not in (403,404) or attempt==11:
                raise SystemExit('Installation check HTTP '+str(error.code)) from None
            time.sleep(2)
    print(json.dumps(result))
finally:
    upload_worker(m.NAME,modules,metadata)
    # Cloudflare retains secret bindings omitted from an upload.
    call('DELETE','/workers/scripts/'+m.NAME+'/secrets/INSTALL_CHECK_TOKEN')
    print('Temporary installation route and credential removed.')
