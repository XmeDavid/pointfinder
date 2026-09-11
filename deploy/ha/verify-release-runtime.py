"""Read-only verification of immutable image convergence and container health.

Run after CI reports completion; no credentials or container environments print.
Exit nonzero while Swarm has not converged or a rollback has occurred.
"""
import json
import shlex
import subprocess
import sys
from dokploy_api import call

SSH={'davidsbatista':['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-i',
    '/Users/xmedavid/.ssh/id_ed25519','root@internal.davidsbatista.com'],
    'arthur':['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-i',
    '/Users/xmedavid/.ssh/vectr','-o','HostKeyAlias=arthur.tailae61a2.ts.net','root@arthur']}
def docker(host,*args):
    r=subprocess.run(SSH[host]+[shlex.join(['docker',*args])],capture_output=True,text=True,check=True)
    return r.stdout
try:
    ok=True
    for aid in ['NTaYSoOkFkXakwG13jeAY','MhafmNK8-0-WsWqR-0IF5']:
        app=call('GET','application.one?applicationId='+aid)
        service=json.loads(docker('davidsbatista','service','inspect',app['appName']))[0]
        image=app['dockerImage']
        update=service.get('UpdateStatus',{}).get('State','none')
        ids=docker('davidsbatista','service','ps','-q','--filter','desired-state=running',app['appName']).split()
        tasks=json.loads(docker('davidsbatista','inspect',*ids)) if ids else []
        nodes=[]
        for task in tasks:
            node=json.loads(docker('davidsbatista','node','inspect',task['NodeID']))[0]['Description']['Hostname']
            state=task['Status']['State']
            health='not-running'
            matches=task['Spec']['ContainerSpec']['Image']==image
            if state=='running' and node in SSH:
                cid=task['Status']['ContainerStatus']['ContainerID']
                raw=json.loads(docker(node,'inspect',cid))[0]
                health=raw['State'].get('Health',{}).get('Status','running')
                if aid=='NTaYSoOkFkXakwG13jeAY' and health!='healthy':ok=False
            if not matches or state!='running':ok=False
            nodes.append({'node':node,'state':state,'health':health,'requestedImage':matches})
        good=(service['Spec']['TaskTemplate']['ContainerSpec']['Image']==image
              and update in ('completed','none') and len(tasks)==2
              and {x['node'] for x in nodes}=={'davidsbatista','arthur'})
        ok=ok and good
        print(json.dumps({'application':app['name'],'image':image,'update':update,'tasks':nodes}))
    raise SystemExit(0 if ok else 1)
except Exception as exc:
    print('Runtime verification failed:',type(exc).__name__)
    raise SystemExit(1)
