"""Narrow authenticated Cloudflare calls; credentials never in argv or logs."""
import json
from pathlib import Path
import urllib.request
import urllib.error
import uuid

ACCOUNT='6b282f8befa2b4d39ad911e7e674885f'

def call(method,path,body=None,content_type='application/json'):
    token=None
    for line in Path('/Users/xmedavid/.env').read_text().splitlines():
        key,sep,value=line.partition('=')
        if sep and key.strip()=='CLOUDFLARE_API_KEY':token=value.strip().strip('\"\'')
    assert token,'Missing Cloudflare token'
    payload=body if isinstance(body,bytes) else json.dumps(body).encode() if body is not None else None
    req=urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,
        data=payload,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':content_type})
    try:
        with urllib.request.urlopen(req,timeout=60) as response:data=json.load(response)
    except urllib.error.HTTPError as e:
        codes=[]
        try:codes=[x.get('code') for x in json.load(e).get('errors',[])]
        except Exception:pass
        raise RuntimeError('Cloudflare HTTP '+str(e.code)+' error codes '+str(codes)) from None
    if not data.get('success'):raise RuntimeError('Cloudflare rejected request; details withheld')
    return data['result']

def upload_worker(name, modules, metadata):
    """Build multipart body in memory so secret bindings never touch temp files."""
    boundary='pointfinder-'+uuid.uuid4().hex
    pieces=[]
    for filename,mime,value in [('metadata','application/json',json.dumps(metadata).encode())]+[
            (key,'application/javascript+module',value) for key,value in modules.items()]:
        assert '\"' not in filename and '\r' not in filename and '\n' not in filename
        pieces.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="'+filename+'"; filename="'+filename+'"\r\nContent-Type: '+mime+'\r\n\r\n').encode()+value+b'\r\n')
    pieces.append(('--'+boundary+'--\r\n').encode())
    return call('PUT','/workers/scripts/'+name,b''.join(pieces),'multipart/form-data; boundary='+boundary)
