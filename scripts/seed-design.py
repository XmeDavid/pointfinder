#!/usr/bin/env python3
"""Seed the isolated pointfinder-design project, preserving existing game edits."""
import json
import subprocess
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ['docker', 'compose', '-f', str(ROOT / 'docker-compose.design.yml')]
API = 'http://127.0.0.1:8188/api'
CATALOG_PATH = ROOT / 'data/design/catalog.json'
PASSWORD = 'Trailhead2026!'
CURATOR_EMAIL = 'curator@pointfinder.local'
GUIDE_NAME = 'Your lighthouse trail guide'
GUIDE_CONTENT = '''<h1>The lighthouse trail</h1>
<p>A coastal afternoon with Lavos Pathfinder Club. Take your time, stay together,
and let the small discoveries lead the way.</p>
<h2>Before you set off</h2>
<ul><li>Meet your team at the trailhead by the boardwalk.</li>
<li>Bring water, a charged phone and a light layer for the sea breeze.</li>
<li>Scan the QR marker at each stop to check in and open its challenge.</li></ul>
<h2>Afternoon plan</h2>
<table><thead><tr><th>When</th><th>What happens</th></tr></thead><tbody>
<tr><td>14:00</td><td>Welcome and a quick equipment check at the trailhead.</td></tr>
<tr><td>14:15</td><td>Teams set off along the coastal trail.</td></tr>
<tr><td>15:15</td><td>Water break near the old lookout.</td></tr>
<tr><td>16:00</td><td>Meet at the final viewpoint to share your discoveries.</td></tr>
</tbody></table>
<h2>Playing together</h2>
<p>One person's check-in or completed challenge moves the whole team forward.
Agree on your answer before sending it. If a challenge needs a review, keep
exploring while the organizers check it.</p>
<h2>Along the coast</h2>
<ul><li>Stay on marked paths and keep off the dunes.</li>
<li>Leave every marker where you found it and take your litter with you.</li>
<li>If a marker is damaged or your team gets stuck, ask an organizer at the trailhead.</li></ul>
<p><strong>Look closely, help each other and enjoy the sea air.</strong></p>'''


class ApiError(RuntimeError):
    def __init__(self, method, path, status, detail):
        self.status = status
        super().__init__(f'{method} {path}: {status} {detail}')


def request(method, path, data=None, token=None, *, multipart=False):
    headers = {'Content-Type': 'application/json'}
    body = json.dumps(data).encode() if data is not None else None
    if multipart:
        boundary = 'pointfinder-design-' + uuid.uuid4().hex
        headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n'
                'Content-Type: application/json\r\n\r\n').encode()
        body += json.dumps(data).encode() + f'\r\n--{boundary}--\r\n'.encode()
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(API + path, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raise ApiError(method, path, error.code, error.read().decode()) from error


def login(email):
    return request('POST', '/auth/login', {'email': email, 'password': PASSWORD})['accessToken']


def save_catalog(catalog):
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_PATH.write_text(json.dumps(catalog, indent=2) + '\n')


def ensure_game(catalog, key, name, place, token, description=None):
    """Remember IDs so a renamed seed game is never duplicated or overwritten."""
    entry = next((row for row in catalog if row.get('seedKey') == key), None)
    if entry is None:
        entry = next((row for row in catalog if row['name'] == name), None)
    games = request('GET', '/games', token=token)
    game = next((row for row in games if entry and row['id'] == entry['id']), None)
    if entry and game is None:
        raise RuntimeError(f'Seeded game {name!r} was removed. Leaving that deletion intact.')
    if game is None:
        game = next((row for row in games if row['name'] == name), None)
    created = game is None
    if created:
        game = request('POST', '/games', {
            'name': name,
            'description': description or f'Explore {place}, solve challenges together and discover what lies along the trail.',
            'defaultCheckInMethod': 'QR', 'uniformAssignment': True, 'tileSource': 'voyager',
        }, token)
    if entry is None:
        entry = {'id': game['id'], 'name': game['name'], 'place': place,
                 'joinCode': '', 'status': game['status'], 'seedComplete': not created}
        catalog.append(entry)
    entry.update(seedKey=key, name=game['name'], status=game['status'])
    save_catalog(catalog)
    return entry, game, created


def ensure_teams(game_id, names, token):
    prefix = f'/games/{game_id}/teams'
    teams = request('GET', prefix, token=token)
    return [next((row for row in teams if row['name'] == name), None)
            or request('POST', prefix, {'name': name}, token) for name in names]


def ensure_stops(game_id, stops, lng, lat, token, *, automatic=False):
    """Complete an interrupted initial seed; never update an existing stop."""
    prefix = f'/games/{game_id}'
    bases = request('GET', prefix + '/bases', token=token)
    challenges = request('GET', prefix + '/challenges', token=token)
    assignments = request('GET', prefix + '/assignments', token=token)
    result = []
    for index, (name, clue, answer) in enumerate(stops):
        challenge = next((row for row in challenges if row['title'] == name), None)
        if challenge is None:
            challenge = request('POST', prefix + '/challenges', {
                'title': name, 'description': 'Look around and solve the clue together.',
                'content': f'<p>{clue}</p>', 'answerType': 'text', 'points': 100,
                'autoValidate': automatic, 'correctAnswer': [answer] if automatic else None,
                'locationBound': False,
            }, token)
        base = next((row for row in bases if row['name'] == name), None)
        if base is None:
            base = request('POST', prefix + '/bases', {
                'name': name, 'description': 'A place to pause and explore.',
                'lat': lat + index * .0018, 'lng': lng + index * .001, 'checkInMethod': 'QR',
            }, token)
        if not any(row['baseId'] == base['id'] for row in assignments):
            request('POST', prefix + '/assignments', {'baseId': base['id'], 'challengeId': challenge['id']}, token)
        result.append((base, challenge, answer))
    return result


def seed_standard_game(catalog, key, name, place, lng, lat, status, token):
    entry, game, created = ensure_game(catalog, key, name, place, token)
    prefix = f'/games/{game["id"]}'
    if created or entry.get('seedComplete') is False:
        teams = ensure_teams(game['id'], ['Falcons', 'Foxes', 'Otters'], token)
        stops = [(stop, 'Find something that tells the story of this place. What did you discover?', '')
                 for stop in ['The trailhead', 'Old lookout', 'Hidden garden', 'River crossing', 'Stone steps', 'The final viewpoint']]
        ensure_stops(game['id'], stops, lng, lat, token)
        if game['status'] == 'setup' and status == 'live':
            game = request('PATCH', prefix + '/status', {'status': 'live'}, token)
        entry.update(joinCode=teams[0]['joinCode'], status=game['status'], seedComplete=True)
    else:
        # Preserve games edited, ended or returned to setup by the user.
        teams = request('GET', prefix + '/teams', token=token)
        if teams and not any(team['joinCode'] == entry.get('joinCode') for team in teams):
            entry['joinCode'] = teams[0]['joinCode']
    save_catalog(catalog)
    return entry


def seed_guide(catalog, lighthouse, club):
    resources = request('GET', f'/games/{lighthouse["id"]}/resources', token=club)
    if lighthouse.get('guideResourceId'):
        # Do not replace edits, sharing changes or an intentional deletion.
        return next((row for row in resources if row['id'] == lighthouse['guideResourceId']), None)
    guide = next((row for row in resources if row['name'] == GUIDE_NAME), None)
    if guide is None:
        guide = request('POST', f'/games/{lighthouse["id"]}/resources', {
            'name': GUIDE_NAME, 'type': 'document', 'sharedWithPlayers': True, 'content': GUIDE_CONTENT,
        }, club, multipart=True)
    lighthouse['guideResourceId'] = guide['id']
    save_catalog(catalog)
    return guide


def ensure_initial_participation(lighthouse, owner):
    me = request('GET', '/account/me', token=owner)
    if any(row['gameId'] == lighthouse['id'] for row in me['participations']):
        return
    request('POST', '/account/join', {
        'joinCode': lighthouse['joinCode'], 'displayName': 'David', 'deviceId': 'local-design-seed',
    }, owner)


def seed_history(catalog, owner, club):
    entry, game, created = ensure_game(catalog, 'river-history', 'Along the river', 'Figueira da Foz', club,
        'Follow the Mondego from the old boat houses to the estuary. Three clues, a shared discovery and a riverside finish.')
    if not created and entry.get('seedComplete', True):
        return entry
    prefix = f'/games/{game["id"]}'
    if game['status'] == 'ended':
        entry.update(status='ended', seedComplete=True)
        save_catalog(catalog)
        return entry
    teams = ensure_teams(game['id'], ['Falcons', 'Otters'], club)
    stops = ensure_stops(game['id'], [
        ('The boat houses', 'The Mondego runs past these old boat houses. Is it a river, lake or canal?', 'river'),
        ('A crossing together', 'What structure carries people from one riverbank to the other?', 'bridge'),
        ('Where the water meets', 'At the estuary the river meets something larger. What is it?', 'sea'),
    ], -8.86, 40.147, club, automatic=True)
    if game['status'] == 'setup':
        game = request('PATCH', prefix + '/status', {'status': 'live'}, club)
    # Historical game only: no recovery of the current lighthouse participation.
    david = request('POST', '/account/join', {
        'joinCode': teams[0]['joinCode'], 'displayName': 'David', 'deviceId': 'local-design-river-history-david',
    }, owner)
    lia = request('POST', '/auth/player/join', {
        'joinCode': teams[0]['joinCode'], 'displayName': 'Lia', 'deviceId': 'local-design-river-history-lia',
    })
    hugo = request('POST', '/auth/player/join', {
        'joinCode': teams[1]['joinCode'], 'displayName': 'Hugo', 'deviceId': 'local-design-river-history-hugo',
    })
    for player, route in [(david, stops[:1]), (lia, stops[1:]), (hugo, stops[:1])]:
        for base, challenge, answer in route:
            player_prefix = f'/player/games/{game["id"]}'
            request('POST', player_prefix + f'/bases/{base["id"]}/check-in',
                    {'method': 'qr', 'token': base['nfcToken']}, player['token'])
            request('POST', player_prefix + '/submissions', {
                'baseId': base['id'], 'challengeId': challenge['id'], 'answer': answer,
                'idempotencyKey': str(uuid.uuid5(uuid.NAMESPACE_URL,
                    f'pointfinder-design:{game["id"]}:{player["player"]["id"]}:{base["id"]}')),
            }, player['token'])
    summary = request('GET', prefix + '/end-summary', token=club)
    if summary['pendingReviews']:
        raise RuntimeError('Historical game has pending reviews; leaving them intact instead of ending it.')
    game = request('PATCH', prefix + '/status', {'status': 'ended'}, club)
    reward = request('GET', f'/player/games/{game["id"]}/reward', token=david['token'])
    if reward['state'] != 'finalized' or reward['xp'] <= 0 or not reward['placement']['completed']:
        raise RuntimeError('Historical game ended without the expected completed XP result.')
    entry.update(joinCode=teams[0]['joinCode'], status=game['status'], seedComplete=True)
    save_catalog(catalog)
    print(f'History: {game["name"]}; David earned {reward["xp"]} XP, '
          f'placement {reward["placement"]["placement"]} of {reward["placement"]["teams"]}.')
    return entry


def seed_publications(catalog, club, curator):
    """Initial public summaries only; reruns never republish or undo curation edits."""
    listings = [
        ('coast', 'Salt, sand & hidden stories', 'Costa de Lavos', 40.08, -8.87,
         'Follow the coast, find the hidden checkpoints and uncover the stories behind the shore.', True),
        ('forest', 'Into the pinewoods', 'Mata Nacional do Urso', 40.02, -8.83,
         'Leave the road behind. Find your way between the pines, one challenge at a time.', True),
        ('city', 'The city between river & sea', 'Figueira da Foz', 40.15, -8.86,
         'A different way to meet the city: quiet corners, local stories and a trail of discoveries.', False),
    ]
    for key, title, place, lat, lng, summary, featured in listings:
        entry = next(row for row in catalog if row.get('seedKey') == key)
        if entry.get('publicationSeeded'):
            continue
        prefix = f'/games/{entry["id"]}/publication'
        try:
            request('GET', prefix, token=club)
        except ApiError as error:
            if error.status != 404:
                raise
        else:
            # A draft/listing already exists: its content, admission, publication
            # and featured status belong to the person who edited it, not the seed.
            entry['publicationSeeded'] = True
            save_catalog(catalog)
            continue
        teams = request('GET', f'/games/{entry["id"]}/teams', token=club)
        falcons = next((team for team in teams if team['name'] == 'Falcons'), None)
        if falcons is None:
            raise RuntimeError(f'{title}: Falcons was removed or renamed; leaving admission untouched.')
        # Approximate place coordinates are authored explicitly, never copied from bases.
        request('PUT', prefix, {
            'title': title, 'summary': summary, 'place': place, 'lat': lat, 'lng': lng,
            'category': key, 'admissionTeamId': falcons['id'],
        }, club)
        request('POST', prefix + '/publish', token=club)
        if featured:
            request('POST', f'/admin/publications/{entry["id"]}/feature', token=curator)
        entry['publicationSeeded'] = True
        save_catalog(catalog)
        print(f'Explore: {title} published' + (' and featured.' if featured else '.'))


def main():
    # Only local login identities use bootstrap SQL. Game content and all
    # participation, check-ins, completion and XP use authorized domain APIs.
    sql = """CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO users(email,name,password_hash,role,email_verified) VALUES
('david@pointfinder.local','David Costa',crypt('Trailhead2026!',gen_salt('bf',10)),'operator',true),
('club@pointfinder.local','Lavos Pathfinder Club',crypt('Trailhead2026!',gen_salt('bf',10)),'operator',true),
('curator@pointfinder.local','PointFinder Local Curator',crypt('Trailhead2026!',gen_salt('bf',10)),'admin',true)
ON CONFLICT(email) DO NOTHING;"""
    subprocess.run(COMPOSE + ['exec', '-T', 'postgres', 'psql', '-U', 'scout', '-d', 'pointfinder', '-v', 'ON_ERROR_STOP=1'],
                   input=sql, text=True, check=True, stdout=subprocess.DEVNULL)
    owner, club = login('david@pointfinder.local'), login('club@pointfinder.local')
    catalog = json.loads(CATALOG_PATH.read_text()) if CATALOG_PATH.exists() else []
    seeds = [
        ('lighthouse', 'The lighthouse trail', 'Costa de Lavos', -8.8708, 40.0797, 'live', club),
        ('coast', 'Salt, sand & hidden stories', 'Costa de Lavos', -8.8708, 40.0797, 'live', club),
        ('forest', 'Into the pinewoods', 'Mata Nacional do Urso', -8.826, 40.018, 'live', club),
        ('city', 'The city between river & sea', 'Figueira da Foz', -8.862, 40.15, 'live', club),
        ('camp', 'Autumn camp', 'Serra da Lousã', -8.244, 40.114, 'live', owner),
        ('river', 'River expedition', 'Coimbra', -8.429, 40.204, 'setup', owner),
    ]
    entries = [seed_standard_game(catalog, *seed) for seed in seeds]
    ensure_initial_participation(entries[0], owner)
    guide = seed_guide(catalog, entries[0], club)
    seed_history(catalog, owner, club)
    seed_publications(catalog, club, login(CURATOR_EMAIL))
    print(f'Ready: {len(catalog)} catalog games; lighthouse guide '
          f'{"available" if guide else "left deleted"}. Account: david@pointfinder.local / {PASSWORD}')


if __name__ == '__main__':
    main()
