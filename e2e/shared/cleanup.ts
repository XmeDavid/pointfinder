import fs from 'fs';
import path from 'path';
import { config } from './config';
import * as api from './api-client';
import { loadRunContext, archiveRunContext } from './run-context';
import { loginAndStoreTokens, getOperatorToken, deleteTokens } from './auth';

const RUNTIME_DIR = path.resolve(__dirname, '..', '.runtime');

async function main() {
  let token: string;
  let runId: string | undefined;

  // Try to load run context for tracked cleanup
  try {
    const latestRunId = fs
      .readFileSync(path.join(RUNTIME_DIR, 'latest-run-id'), 'utf-8')
      .trim();
    runId = latestRunId;

    try {
      token = getOperatorToken(runId);
    } catch {
      const result = await loginAndStoreTokens(runId);
      token = result.accessToken;
    }

    const ctx = loadRunContext(runId);
    console.log(`Cleaning up run ${runId}: ${ctx.createdGameIds.length} tracked games`);

    for (const gameId of ctx.createdGameIds) {
      try {
        // Ensure game is not active before deleting
        const game = await api.getGame(token, gameId);
        if (game.status === 200 && game.data.status === 'live') {
          await api.updateGameStatus(token, gameId, 'ended');
        }
        const res = await api.deleteGame(token, gameId);
        console.log(`  Deleted game ${gameId}: ${res.status}`);
      } catch (err) {
        console.error(`  Failed to delete game ${gameId}:`, err);
      }
    }

    // Archive and clean up runtime files
    archiveRunContext(runId);
    deleteTokens(runId);
    console.log('Tracked cleanup complete.');
  } catch {
    // No run context — do orphan cleanup
    console.log('No run context found. Running orphan cleanup...');

    const result = await loginAndStoreTokens(config.runId);
    token = result.accessToken;

    const { status, data: games } = await api.getGames(token);
    if (status !== 200) {
      console.error('Failed to list games:', status);
      process.exit(1);
    }

    let cleaned = 0;
    for (const game of games) {
      // Safety: only delete games with E2E prefix
      if (game.name && game.name.startsWith('E2E ')) {
        try {
          if (game.status === 'live') {
            await api.updateGameStatus(token, game.id, 'completed');
          }
          const res = await api.deleteGame(token, game.id);
          console.log(`  Deleted orphan "${game.name}" (${game.id}): ${res.status}`);
          cleaned++;
        } catch (err) {
          console.error(`  Failed to delete orphan "${game.name}":`, err);
        }
      }
    }
    console.log(`Orphan cleanup complete. Removed ${cleaned} games.`);

    // Clean up temp tokens
    deleteTokens(config.runId);
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
