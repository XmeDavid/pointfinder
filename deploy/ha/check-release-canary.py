"""Exercise fixed-target release API without printing its token."""
import json
import pathlib
import sys
import urllib.request
from dokploy_api import call

path=pathlib.Path('/Users/xmedavid/.codex/pointfinder-ha-recovery/release-activation.json')
state=json.loads(path.read_text())
relay=call('GET','application.one?applicationId=QEhQLas-iMl1aksHLb3pt')
env=dict(x.split('=',1) for x in relay['env'].splitlines() if '=' in x)
token=env['RELAY_TOKEN'].strip().strip('\"\'')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
opener=urllib.request.build_opener(NoRedirect)
try:
    if sys.argv[1]=='start':
        assert not state.get('releaseId'), 'Already started; inspect status first'
        image=state['frontendImage'];repo,digest=image.split('@')
        request=urllib.request.Request('https://actions.davidsbatista.com/release/pointfinder-release-check',
            data=json.dumps({'repository':repo,'digest':digest,'revision':'6f9be220','runId':'34450640054'}).encode(),
            headers={'X-Deploy-Token':token,'Content-Type':'application/json'},method='POST')
        with opener.open(request,timeout=60) as response:
            assert response.status==202
            result=json.load(response)
        state['releaseId']=result['releaseId'];path.write_text(json.dumps(state))
        print('Canary release queued:',state['releaseId'])
    else:
        request=urllib.request.Request('https://actions.davidsbatista.com/release/pointfinder-release-check/'+state['releaseId'],
            headers={'X-Deploy-Token':token})
        with opener.open(request,timeout=30) as response: result=json.load(response)
        print({k:result.get(k) for k in ['releaseId','found','status','deploymentId','terminal']})
except Exception as exc:
    print('Canary check failed:',type(exc).__name__,getattr(exc,'code',''))
    raise SystemExit(1)
