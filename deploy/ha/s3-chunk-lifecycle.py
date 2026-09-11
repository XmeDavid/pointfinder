"""Bound obsolete chunk versions only; preserve current chunks and media history."""
import json, os, pathlib
from botocore.exceptions import ClientError
from s3_storage import client, BUCKETS

admin=client()
bucket=BUCKETS[0]
try:
    old=admin.get_bucket_lifecycle_configuration(Bucket=bucket)['Rules']
except ClientError as e:
    if e.response['Error']['Code']!='NoSuchLifecycleConfiguration': raise
    old=[]
rules=[
    {'ID':'pointfinder-obsolete-chunk-versions','Status':'Enabled','Prefix':'chunk-sessions/',
     'NoncurrentVersionExpiration':{'NoncurrentDays':7}},
    {'ID':'pointfinder-empty-chunk-delete-markers','Status':'Enabled','Prefix':'chunk-sessions/',
     'Expiration':{'ExpiredObjectDeleteMarker':True}},
]
ids={r['ID'] for r in rules}
for r in old:
    if r.get('ID') in ids and r not in rules:
        raise RuntimeError('Existing chunk lifecycle differs; review required')
merged=[r for r in old if r.get('ID') not in ids]+rules
os.umask(0o077)
p=pathlib.Path('/Users/xmedavid/.codex/pointfinder-ha-recovery/s3-lifecycle-before-chunks.json')
if not p.exists():
    with p.open('x') as f: json.dump({'Rules':old},f)
admin.put_bucket_lifecycle_configuration(Bucket=bucket,LifecycleConfiguration={'Rules':merged})
actual=admin.get_bucket_lifecycle_configuration(Bucket=bucket)['Rules']
assert sorted(actual,key=lambda r:r['ID'])==sorted(merged,key=lambda r:r['ID'])
print('Verified: only obsolete chunk versions expire after 7 days; current chunks/media unaffected')
