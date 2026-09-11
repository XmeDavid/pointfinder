"""Cut over only PointFinder web/API hostnames; preserve mail and wildcard DNS."""
import json, os, pathlib
from cloudflare_api import call

ACCOUNT='6b282f8befa2b4d39ad911e7e674885f'
TUNNEL='87cdb8c2-e8d3-4dae-9052-32d4def29e23'
ZONES={'pointfinder.ch':'405c58517409faaacf14cef9c15da6ae',
       'pointfinder.pt':'a2b84677589c7f3dff25f546ce80632b'}
target=TUNNEL+'.cfargotunnel.com'
os.umask(0o077)
recovery=pathlib.Path('/Users/xmedavid/.codex/pointfinder-ha-recovery')
path=f'accounts/{ACCOUNT}/cfd_tunnel/{TUNNEL}/configurations'
old=call('GET',path)['result']['config']
backup=recovery/'tunnel-config-before-production.json'
if not backup.exists():backup.write_text(json.dumps(old))
expected={'tunnel-check.pointfinder.ch','tunnel-check.pointfinder.pt'}
hosts=[h for d in ZONES for h in (d,'www.'+d,'api.'+d)]
assert {r.get('hostname') for r in old['ingress'] if r.get('hostname')} <= expected|set(hosts)
config=dict(old)
config['ingress']=[{'hostname':h,'service':'http://origin:8080'} for h in sorted(expected|set(hosts))]+[{'service':'http_status:404'}]
call('PUT',path,{'config':config})
assert call('GET',path)['result']['config']['ingress']==config['ingress']
print('Tunnel production hostname routes verified',flush=True)
for domain,zone in ZONES.items():
    assert call('GET','zones/'+zone)['result']['status']=='active'
    for name in (domain,'api.'+domain):
        records=call('GET','zones/'+zone+'/dns_records?name='+name)['result']
        records=[r for r in records if r['type'] in ('A','AAAA','CNAME')]
        assert len(records)<=1, 'Multiple origin records require review'
        body={'type':'CNAME','name':name,'content':target,'proxied':True,'ttl':1}
        before=recovery/('dns-cutover-'+name+'.json')
        if not before.exists():before.write_text(json.dumps(records))
        if records:
            r=records[0]
            assert r['content'] in ('46.224.114.147',target)
            result=call('PATCH','zones/'+zone+'/dns_records/'+r['id'],body)['result']
        else:
            result=call('POST','zones/'+zone+'/dns_records',body)['result']
        assert result['type']=='CNAME' and result['content']==target and result['proxied']
        print(name+' now routes to redundant tunnel',flush=True)
