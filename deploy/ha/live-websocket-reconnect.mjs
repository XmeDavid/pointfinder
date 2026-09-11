// Synthetic operator/game only. Credentials arrive through stdin, never URLs/logs.
// First stdin line is {token,game}; a later {finish:true} ends the rehearsal.
import readline from 'node:readline';
import assert from 'node:assert/strict';

let config, ending = false, timer, sequence = 0, busy = false;
const clients = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const headers = () => ({Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json'});
let ready = false;

function connect(client) {
  if (ending) return;
  const ws = new WebSocket(`wss://api.${client.domain}/ws-native`, ['v12.stomp']);
  client.ws = ws;
  client.connected = false;
  let buffer = '';
  const timeout = setTimeout(() => ws.close(), 15000);
  ws.onopen = () => ws.send(`CONNECT\naccept-version:1.2\nhost:api.${client.domain}\nAuthorization:Bearer ${config.token}\nheart-beat:0,0\n\n\0`);
  ws.onmessage = event => {
    buffer += String(event.data);
    while (buffer.includes('\0')) {
      const index = buffer.indexOf('\0');
      const frame = buffer.slice(0, index).trimStart();
      buffer = buffer.slice(index + 1);
      if (frame.startsWith('CONNECTED\n')) {
        clearTimeout(timeout);
        client.connected = true;
        client.connections++;
        console.log(JSON.stringify({domain:client.domain,connected:client.connections}));
        client.afterReconnectEvents = 0;
        ws.send(`SUBSCRIBE\nid:ha-check\ndestination:/topic/games/${config.game}\nack:auto\n\n\0`);
      } else if (frame.startsWith('MESSAGE\n')) {
        try {
          const body = JSON.parse(frame.slice(frame.indexOf('\n\n') + 2));
          if (body.type === 'game_config') {
            client.events++;
            client.afterReconnectEvents++;
            client.version = body.stateVersion;
          }
        } catch { /* No raw protocol frames in logs. */ }
      } else if (frame.startsWith('ERROR\n')) {
        client.protocolErrors++;
        ws.close();
      }
    }
  };
  ws.onerror = () => {};
  ws.onclose = () => {
    clearTimeout(timeout);
    client.connected = false;
    if (!ending) setTimeout(() => connect(client), 1000);
  };
}

async function mutate() {
  if (busy) return;
  busy = true;
  try {
    const name = `HA migration verification ${++sequence}`;
    const result = await fetch(`https://api.pointfinder.ch/api/games/${config.game}`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({name}), signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) {
      console.log(JSON.stringify({mutation_status:result.status}));
      return;
    }
    const saved = await result.json();
    if (saved.name !== name) return;
    if (!ready && clients.every(c => c.connected && c.events > 0)) {
      ready = true;
      console.log(JSON.stringify({ready:true}));
    }
  } catch { /* Temporary failures are expected during the injected restart. */ }
  finally { busy = false; }
}

async function finish() {
  clearInterval(timer);
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && (busy || !clients.every(c => c.connected))) await delay(250);
  assert(clients.every(c => c.connected && c.connections >= 2), 'Both clients must reconnect');
  const before = clients.map(c => c.events);
  await mutate();
  while (Date.now() < deadline && !clients.every((c,i) => c.events > before[i])) await delay(250);
  assert(clients.every((c,i) => c.events > before[i]), 'Both reconnected clients must receive a committed event');
  assert.equal(clients[0].version, clients[1].version, 'Both domains must see the same state version');
  for (const client of clients) {
    const response = await fetch(`https://api.${client.domain}/api/games/${config.game}`, {headers:headers(), signal:AbortSignal.timeout(10000)});
    assert(response.ok);
    const game = await response.json();
    assert.equal(game.name, `HA migration verification ${sequence}`, 'Refresh must recover authoritative state');
  }
  ending = true;
  clients.forEach(c => c.ws.close());
  console.log(JSON.stringify({result:'passed',clients:clients.map(({domain,connections,events,version}) => ({domain,connections,events,version}))}));
  process.exit(0);
}

const lines = readline.createInterface({input: process.stdin});
lines.on('line', async line => {
  try {
    const input = JSON.parse(line);
    if (!config) {
      assert.match(input.game, /^[0-9a-f-]{36}$/);
      assert(typeof input.token === 'string' && input.token.length > 40);
      config = input;
      for (const domain of ['pointfinder.ch','pointfinder.pt']) {
        const client = {domain,connections:0,events:0,version:null,protocolErrors:0};
        clients.push(client); connect(client);
      }
      timer = setInterval(mutate, 3000);
    } else if (input.finish === true) await finish();
  } catch {
    ending = true;
    clients.forEach(c => c.ws?.close());
    console.log(JSON.stringify({result:'failed',stage:'websocket_contract'}));
    process.exit(1);
  }
});
setTimeout(() => { console.log(JSON.stringify({result:'failed',stage:'deadline'}));process.exit(1); }, 480000).unref();
