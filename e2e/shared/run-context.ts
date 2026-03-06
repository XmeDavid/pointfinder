import fs from 'fs';
import path from 'path';

const RUNTIME_DIR = path.resolve(__dirname, '..', '.runtime');

export interface RunContext {
  runId: string;
  mainGameId: string;
  mainGameName: string;
  broadcastCode?: string;
  baseIds: string[];
  challengeIds: string[];
  assignmentIds: string[];
  teamIds: string[];
  joinCodes: string[];
  createdGameIds: string[];
}

function runtimePath(runId: string) {
  return path.join(RUNTIME_DIR, `${runId}.json`);
}

export function saveRunContext(context: RunContext): void {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(runtimePath(context.runId), JSON.stringify(context, null, 2));
  fs.writeFileSync(path.join(RUNTIME_DIR, 'latest-run-id'), context.runId);
}

export function loadRunContext(runId?: string): RunContext {
  const id = runId || fs.readFileSync(path.join(RUNTIME_DIR, 'latest-run-id'), 'utf-8').trim();
  return JSON.parse(fs.readFileSync(runtimePath(id), 'utf-8'));
}

export function appendCreatedGameId(gameId: string, runId?: string): void {
  const ctx = loadRunContext(runId);
  if (!ctx.createdGameIds.includes(gameId)) {
    ctx.createdGameIds.push(gameId);
    saveRunContext(ctx);
  }
}

export function archiveRunContext(runId?: string): void {
  const id = runId || fs.readFileSync(path.join(RUNTIME_DIR, 'latest-run-id'), 'utf-8').trim();
  const src = runtimePath(id);
  if (!fs.existsSync(src)) return;

  const archiveDir = path.resolve(__dirname, '..', 'artifacts', 'logs');
  fs.mkdirSync(archiveDir, { recursive: true });

  const ctx = JSON.parse(fs.readFileSync(src, 'utf-8'));
  // Redact any sensitive fields (none in context, but future-proof)
  fs.writeFileSync(path.join(archiveDir, `${id}.json`), JSON.stringify(ctx, null, 2));
}
