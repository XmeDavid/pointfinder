import { config } from './config';
import * as api from './api-client';
import { loginAndStoreTokens, joinPlayerAndStoreToken } from './auth';
import { gameFixture, baseFixture, challengeFixture, teamFixture } from './fixtures';
import { saveRunContext, RunContext } from './run-context';

async function main() {
  const runId = config.runId;
  console.log(`Setup: runId = ${runId}`);

  // 1. Login as operator
  const { accessToken: token } = await loginAndStoreTokens(runId);
  console.log('1. Logged in as operator');

  // 2. Create main game
  const gameFix = gameFixture(runId);
  const game = await api.createGame(token, gameFix);
  if (game.status !== 201) throw new Error(`Create game failed: ${game.status} ${JSON.stringify(game.data)}`);
  const gameId = game.data.id;
  console.log(`2. Created main game: ${gameId} ("${gameFix.name}")`);

  // 2b. Enable broadcast (broadcastEnabled is only on UpdateGameRequest)
  const updateRes = await api.updateGame(token, gameId, { name: gameFix.name, broadcastEnabled: true });
  if (updateRes.status !== 200) throw new Error(`Enable broadcast failed: ${updateRes.status}`);
  console.log('2b. Enabled broadcast');

  // 3. Create 3 bases
  const baseIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const base = await api.createBase(token, gameId, baseFixture(i));
    if (base.status !== 201) throw new Error(`Create base ${i} failed: ${base.status}`);
    baseIds.push(base.data.id);
    console.log(`3.${i}. Created base: ${base.data.id}`);
  }

  // 4. Create 4 challenges (3 text + 1 file, matching base count + 1 extra)
  const challengeSpecs: Array<{ type: 'text' | 'file'; index: number }> = [
    { type: 'text', index: 0 },
    { type: 'text', index: 1 },
    { type: 'text', index: 2 },
    { type: 'file', index: 3 },
  ];
  const challengeIds: string[] = [];
  for (const spec of challengeSpecs) {
    const ch = await api.createChallenge(token, gameId, challengeFixture(spec.type, spec.index));
    if (ch.status !== 201) throw new Error(`Create challenge ${spec.type}[${spec.index}] failed: ${ch.status}`);
    challengeIds.push(ch.data.id);
    console.log(`4. Created challenge (${spec.type} ${spec.index}): ${ch.data.id}`);
  }

  // 5. Create assignments (base→challenge, uniform)
  const assignmentIds: string[] = [];
  for (let i = 0; i < Math.min(baseIds.length, challengeIds.length); i++) {
    const asgn = await api.createAssignment(token, gameId, {
      baseId: baseIds[i],
      challengeId: challengeIds[i],
    });
    if (asgn.status !== 201) throw new Error(`Create assignment failed: ${asgn.status}`);
    assignmentIds.push(asgn.data.id);
    console.log(`5. Created assignment: base[${i}] → challenge[${i}]`);
  }

  // 6. NFC-link all bases (required for go-live)
  for (let i = 0; i < baseIds.length; i++) {
    const link = await api.nfcLinkBase(token, gameId, baseIds[i]);
    if (link.status !== 200) throw new Error(`NFC link base ${i} failed: ${link.status}`);
    console.log(`6. NFC-linked base[${i}]`);
  }

  // 7. Create 2 teams
  const teamIds: string[] = [];
  const joinCodes: string[] = [];
  for (let i = 0; i < 2; i++) {
    const team = await api.createTeam(token, gameId, { name: teamFixture(i).name });
    if (team.status !== 201) throw new Error(`Create team ${i} failed: ${team.status}`);
    teamIds.push(team.data.id);
    joinCodes.push(team.data.joinCode);
    console.log(`7. Created team: ${team.data.name} (joinCode: ${team.data.joinCode})`);
  }

  // 8. Go live
  const activate = await api.updateGameStatus(token, gameId, 'live');
  if (activate.status !== 200) throw new Error(`Go live failed: ${activate.status}`);
  console.log('8. Game is live');

  // 9. Save run context
  const ctx: RunContext = {
    runId,
    mainGameId: gameId,
    mainGameName: gameFix.name,
    broadcastCode: activate.data.broadcastCode,
    baseIds,
    challengeIds,
    assignmentIds,
    teamIds,
    joinCodes,
    createdGameIds: [gameId],
  };
  saveRunContext(ctx);
  console.log(`9. Saved run context to .runtime/${runId}.json`);

  // 10. Join a player to team 0 for submission tests
  const player = await joinPlayerAndStoreToken(joinCodes[0], 'E2E Player', runId);
  console.log(`10. Player joined: ${player.playerId} → team ${player.teamId}`);

  console.log('\nSetup COMPLETE');
}

main().catch((e) => {
  console.error('Setup FAILED:', e.message);
  process.exit(1);
});
