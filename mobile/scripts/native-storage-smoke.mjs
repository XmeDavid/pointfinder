import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { chromium } = createRequire(new URL('../../web/package.json', import.meta.url))('@playwright/test')
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
const mode = process.argv[2]
const port = process.argv[3]
const stateFile = process.env.PF_NATIVE_SMOKE_STATE ?? join(tmpdir(), 'pointfinder-native-smoke-state.json')
if (!['stage', 'verify'].includes(mode) || !/^\d+$/.test(port ?? '')) throw new Error('Usage: node mobile/scripts/native-storage-smoke.mjs stage|verify <forwarded-CDP-port>')
const state = mode === 'stage' ? { id: randomUUID(), key: `platform-smoke-${randomUUID()}` } : JSON.parse(await readFile(stateFile, 'utf8'))
if (mode === 'stage') await writeFile(stateFile, JSON.stringify(state))
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
const pages = browser.contexts().flatMap((context) => context.pages())
const page = pages.find((page) => /tauri\.localhost/.test(page.url()))
if (!page) throw new Error('PointFinder native webview not found')
const result = await page.evaluate(async ({ mode, state }) => {
  const invoke = window.__TAURI_INTERNALS__.invoke
  const db = await invoke('plugin:sql|load', { db: 'sqlite:pointfinder.db' })
  const sql = (query, values = []) => invoke('plugin:sql|execute', { db, query, values })
  const select = (query, values = []) => invoke('plugin:sql|select', { db, query, values })
  if (mode === 'stage') {
    await invoke('media_write', { id: state.id, offset: 0, bytes: [1, 2, 3] })
    let partialRejected = false
    try { await invoke('media_commit', { id: state.id, size: 5 }) } catch { partialRejected = true }
    if (!partialRejected) throw new Error('Incomplete file was committed')
    await invoke('media_write', { id: state.id, offset: 3, bytes: [4, 5] })
    await invoke('media_commit', { id: state.id, size: 5 })
    await sql('INSERT INTO kv (key, value) VALUES ($1, $2)', [state.key, 'durable-setting'])
    const action = { id: state.id, playerId: 'platform-smoke', gameId: 'platform-smoke', baseId: 'platform-smoke', type: 'submission', challengeId: 'platform-smoke', answer: '', createdAt: new Date().toISOString(), state: 'pending', attempts: 0, nextAttemptAt: 0, media: [{ id: state.id, name: 'smoke.bin', size: 5, contentType: 'application/octet-stream', uploadedBytes: 0 }] }
    await sql('INSERT INTO queue (id, game_id, type, created_at, state, next_attempt_at, payload) VALUES ($1, $2, $3, $4, $5, $6, $7)', [state.id, action.gameId, action.type, action.createdAt, action.state, 0, JSON.stringify(action)])
    await invoke('plugin:pointfinder-secure-store|set', { key: state.key, value: 'synthetic-secret' })
    return { staged: true, partialRejected }
  }
  try {
    const bytes = Array.from(new Uint8Array(await invoke('media_read', { id: state.id, offset: 1, length: 3 })))
    const kv = await select('SELECT value FROM kv WHERE key = $1', [state.key])
    const queue = await select('SELECT payload FROM queue WHERE id = $1', [state.id])
    const secure = await invoke('plugin:pointfinder-secure-store|get', { key: state.key })
    if (JSON.stringify(bytes) !== '[2,3,4]' || kv[0]?.value !== 'durable-setting' || JSON.parse(queue[0]?.payload ?? '{}').media?.[0]?.id !== state.id || secure.value !== 'synthetic-secret') throw new Error('Native persistence did not survive process restart')
    const nfc = await invoke('plugin:pointfinder-nfc|is_available')
    const push = await invoke('plugin:pointfinder-push|permission_status')
    let traversalRejected = false
    try { await invoke('media_read', { id: '../../escape', offset: 0, length: 1 }) } catch { traversalRejected = true }
    if (!traversalRejected) throw new Error('Invalid media path was accepted')
    return { restartedMedia: true, restartedQueue: true, restartedSettings: true, restartedSecureStore: true, traversalRejected, nfc, pushPermission: push.status }
  } finally {
    await sql('DELETE FROM queue WHERE id = $1', [state.id])
    await sql('DELETE FROM kv WHERE key = $1', [state.key])
    await invoke('plugin:pointfinder-secure-store|remove', { key: state.key })
    await invoke('media_remove', { id: state.id })
  }
}, { mode, state })
console.log(JSON.stringify(result))
await browser.close()
if (mode === 'verify') await unlink(stateFile)
