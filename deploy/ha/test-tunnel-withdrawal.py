"""One canary proxy failure at a time; always restore the exact proxy service."""
import json, subprocess, sys, time, urllib.request

node=sys.argv[1]
assert node in ('hetzner','arthur')
base=['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes']
master=base+['-i','/Users/xmedavid/.ssh/id_ed25519','root@internal.davidsbatista.com']
target=master if node=='hetzner' else base+['-o','HostKeyAlias=arthur.tailae61a2.ts.net','-i','/Users/xmedavid/.ssh/vectr','root@arthur']
proxy='pointfinder-cloudflare-ekucrt_proxy_'+node
connector='pointfinder-cloudflare-ekucrt_'+node

def ssh(args,command):
    return subprocess.check_output(args+[command],text=True,timeout=20).strip()
def serving():
    cid=ssh(target,'docker ps -q --filter label=com.docker.swarm.service.name='+connector)
    assert cid and '\n' not in cid
    names=ssh(target,'docker top '+cid+' -eo pid,comm').splitlines()
    assert any('python' in n for n in names)
    return any(n.split()[-1]=='cloudflared' for n in names)
def wait_for(expected,seconds):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        if serving()==expected:return
        time.sleep(1)
    raise RuntimeError('Connector did not reach expected state')

assert serving(), 'Connector must be serving before injection'
try:
    ssh(master,'docker service scale --detach=true '+proxy+'=0')
    start=time.monotonic()
    wait_for(False,45)
    print(node+' connector withdrew in '+str(round(time.monotonic()-start,1))+'s',flush=True)
    peer='arthur' if node=='hetzner' else 'hetzner'
    for domain in ('pointfinder.ch','pointfinder.pt'):
        for path in ('/api-health','/frontend-check'):
            req=urllib.request.Request('https://tunnel-check.'+domain+path,headers={'User-Agent':'PointFinder-Infrastructure-Check/1.0'})
            with urllib.request.urlopen(req,timeout=15) as r:
                assert r.status==200 and r.headers.get('X-PointFinder-Ingress')==peer
                if path=='/api-health':assert json.load(r)['status']=='UP'
            print(domain+path+' served by '+peer,flush=True)
        for host,path in ((domain,'/'),('api.'+domain,'/actuator/health')):
            req=urllib.request.Request('https://'+host+path,headers={'User-Agent':'PointFinder-Infrastructure-Check/1.0'})
            with urllib.request.urlopen(req,timeout=15) as r:
                assert r.status==200
                if path=='/actuator/health':assert json.load(r)['status']=='UP'
            print('Production '+host+path+' remained healthy',flush=True)
finally:
    ssh(master,'docker service scale --detach=true '+proxy+'=1')
    wait_for(True,55)
    print(node+' proxy restored and connector resumed',flush=True)
