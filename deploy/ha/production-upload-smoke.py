"""Root-only synthetic API/S3 smoke test on Hetzner; never prints credentials.

Uses a temporary, non-login operator and a server-seeded practice game. All
game lifecycle transitions go through the real API. State is protected for
explicit recovery/cleanup if an assertion fails. No email or push is sent.
"""
import base64, hashlib, hmac, json, os, pathlib, struct, subprocess, sys, time, uuid, zlib
import boto3
from botocore.config import Config

STATE = pathlib.Path('/var/backups/pointfinder-ha/production-adoption/upload-smoke.json')
SERVICE = 'pointfinder-backend-v4djml'
PG = 'pointfinder-pg-hetzner-vv3yw0-patroni-hetzner-1'
os.umask(0o077)
service = json.loads(subprocess.check_output(['docker','service','inspect',SERVICE]))[0]
env = dict(e.split('=',1) for e in service['Spec']['TaskTemplate']['ContainerSpec']['Env'])
cid = subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.swarm.service.name='+SERVICE],text=True).strip()
assert cid and '\n' not in cid
origins = ['127.0.0.1']
network = 'container:'+cid
request_count = 0
if os.environ.get('PF_SMOKE_TWO_NODES') == '1':
    ids=subprocess.check_output(['docker','service','ps','-q','--filter','desired-state=running',SERVICE],text=True).split()
    tasks=json.loads(subprocess.check_output(['docker','inspect',*ids]))
    assert len(tasks)==2 and all(t['Status']['State']=='running' for t in tasks)
    origins=[next(n['Addresses'][0].split('/')[0] for n in t['NetworksAttachments'] if n['Network']['Spec']['Name']=='dokploy-network') for t in sorted(tasks,key=lambda t:t['Slot'])]
    network='dokploy-network'

def sql(query):
    p = subprocess.run(['docker','exec','-i',PG,'psql','-U','scout','-d','pointfinder','-v','ON_ERROR_STOP=1','-At'],input=query,capture_output=True,text=True)
    if p.returncode: raise RuntimeError('Fixture SQL failed; diagnostics withheld')
    return p.stdout

HTTP = '''import urllib.request, urllib.error, json, sys, base64
p=json.load(sys.stdin)
r=urllib.request.Request('http://'+p['origin']+':8080'+p['path'],method=p['method'],headers=p['headers'],data=base64.b64decode(p['body']) if p['body'] is not None else None)
try:
 with urllib.request.urlopen(r,timeout=45) as x: print(json.dumps({'status':x.status,'body':x.read().decode()}))
except urllib.error.HTTPError as e: print(json.dumps({'status':e.code,'body':e.read().decode()}))
'''
def api(method,path,token=None,body=None,expected=200,binary=False):
    global request_count
    headers={'User-Agent':'PointFinder-Infrastructure-Check/1.0'}
    if token: headers['Authorization']='Bearer '+token
    if body is not None:
        headers['Content-Type']='application/octet-stream' if binary else 'application/json'
        body=body if binary else json.dumps(body).encode()
    payload={'origin':origins[request_count%len(origins)],'method':method,'path':path,'headers':headers,'body':base64.b64encode(body).decode() if body is not None else None}
    request_count+=1
    p=subprocess.run(['docker','run','--rm','-i','--network',network,'--entrypoint','/opt/patroni/bin/python','pointfinder-patroni:16.15-4.1.5-production-pgbackrest-r2','-c',HTTP],input=json.dumps(payload),capture_output=True,text=True,timeout=55)
    if p.returncode: raise RuntimeError('HTTP probe transport failed')
    r=json.loads(p.stdout)
    if r['status']!=expected:
        # Only the error code/status, never raw response data or access tokens.
        try: code=json.loads(r['body']).get('code','unspecified')
        except Exception: code='non-json'
        raise RuntimeError('HTTP '+str(r['status'])+' for '+method+' '+path+'; code='+str(code))
    return json.loads(r['body']) if r['body'] else None

def save(state): STATE.write_text(json.dumps(state))
def token(user):
    enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).rstrip(b'=')
    data=enc({'alg':'HS256','typ':'JWT'})+b'.'+enc({'iss':'pointfinder','aud':['pointfinder-api'],'sub':user,'email':'ha-smoke-'+user+'@example.invalid','role':'operator','type':'user','tv':0,'iat':int(time.time()),'exp':int(time.time())+3600})
    return (data+b'.'+base64.urlsafe_b64encode(hmac.new(env['JWT_SECRET'].encode(),data,hashlib.sha256).digest()).rstrip(b'=')).decode()

action=sys.argv[1]
if action=='prepare':
    assert not STATE.exists(), 'Existing smoke state needs cleanup/review'
    s={'user':str(uuid.uuid4())};save(s)
    u=s['user']
    sql("INSERT INTO users(id,email,name,password_hash,role) VALUES ('"+u+"','ha-smoke-"+u+"@example.invalid','HA migration verification','!disabled','operator');")
    s['operatorToken']=token(u);save(s)
    game=api('POST','/api/users/me/tutorials/fixed-route/practice-game',s['operatorToken'],{'name':'HA migration verification — temporary'},201)
    s['game']=game['id'];save(s)
    api('PATCH','/api/games/'+s['game']+'/status',s['operatorToken'],{'status':'live'})
    teams=api('GET','/api/games/'+s['game']+'/teams',s['operatorToken'])
    joined=api('POST','/api/auth/player/join',body={'joinCode':teams[0]['joinCode'],'displayName':'HA smoke player','deviceId':'ha-smoke-'+u})
    s['playerToken']=joined['token'];save(s)
    print('Temporary practice game created through API, live validation passed, player joined')
elif action=='upload':
    s=json.loads(STATE.read_text())
    def chunk(t,data):return struct.pack('!I',len(data))+t+data+struct.pack('!I',zlib.crc32(t+data)&0xffffffff)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',48,48,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+os.urandom(144) for _ in range(48))))+chunk(b'IEND',b'')
    path='/api/player/games/'+s['game']+'/uploads/sessions'
    r=api('POST',path,s['playerToken'],{'originalFileName':'ha-smoke.png','contentType':'image/png','totalSizeBytes':len(data),'chunkSizeBytes':1024},201)
    s.setdefault('sessions',[]).append(r['sessionId']);save(s)
    path+='/'+r['sessionId']
    for i,start in enumerate(range(0,len(data),1024)):
        api('PUT',path+'/chunks/'+str(i),s['playerToken'],data[start:start+1024],binary=True)
    r=api('POST',path+'/complete',s['playerToken'])
    assert r['status']=='completed'
    s.setdefault('files',[]).append(r['fileUrl']);save(s)
    again=api('POST',path+'/complete',s['playerToken'])
    assert again['fileUrl']==r['fileUrl']
    client=boto3.client('s3',endpoint_url=env['S3_ENDPOINT'],region_name=env['S3_REGION'],aws_access_key_id=env['S3_ACCESS_KEY'],aws_secret_access_key=env['S3_SECRET_KEY'],config=Config(request_checksum_calculation='when_required',response_checksum_validation='when_required'))
    # The deterministic final object key is independent of presigned URL format.
    key=s['game']+'/'+r['sessionId']+'.png'
    with client.get_object(Bucket=env['S3_BUCKET'],Key=key)['Body'] as stream:actual=stream.read()
    assert actual==data
    print('Authenticated multi-chunk PNG upload, completion retry, and S3 byte comparison passed across '+str(len(origins))+' backend(s)')
elif action=='cleanup':
    s=json.loads(STATE.read_text())
    if 'game' in s:
        api('PATCH','/api/games/'+s['game']+'/status',s['operatorToken'],{'status':'ended'})
        api('DELETE','/api/games/'+s['game'],s['operatorToken'],expected=204)
    sql("DELETE FROM user_tutorial_progress WHERE user_id='"+s['user']+"'; DELETE FROM users WHERE id='"+s['user']+"' AND email='ha-smoke-"+s['user']+"@example.invalid';")
    s['cleaned']=True;save(s)
    print('Temporary game/player/operator removed; versioned S3 cleanup tracked separately')
else: raise SystemExit('Unknown action')
