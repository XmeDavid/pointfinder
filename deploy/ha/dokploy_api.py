"""Access Dokploy through an authenticated local SSH forward; never print secrets.

Usage: python3 dokploy_api.py GET project.all
POST bodies come from stdin. Output is restricted to identifier/status fields.
Forward 127.0.0.1:33007 to the Dokploy server's 127.0.0.1:3000 first.
"""
import json
import pathlib
import sys
import urllib.request

SAFE = {"name", "projectId", "environmentId", "composeId", "applicationId",
        "postgresId", "serverId", "composeStatus", "message", "code", "status"}

def compact(value):
    if isinstance(value, list):
        return [compact(item) for item in value]
    if isinstance(value, dict):
        return {key: (item if key in SAFE else compact(item))
                for key, item in value.items()
                if key in SAFE or isinstance(item, (dict, list))}
    return value

def call(method, endpoint, body=None):
    token = None
    for line in pathlib.Path('/Users/xmedavid/.env').read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep and key.strip() == 'DOKPLOY_API_KEY':
            token = value.strip().strip('\"\'')
    if not token:
        raise SystemExit('DOKPLOY_API_KEY is not configured')
    request = urllib.request.Request(
        'http://127.0.0.1:33007/api/' + endpoint,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'x-api-key': token, 'Content-Type': 'application/json'}, method=method)
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = response.read()
        return json.loads(payload) if payload.strip() else None

if __name__ == '__main__':
    method, endpoint = sys.argv[1:3]
    body = json.load(sys.stdin) if method != 'GET' else None
    print(json.dumps(compact(call(method, endpoint, body)), indent=2))
