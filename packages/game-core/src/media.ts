import { ApiError, type PointFinderApi, type UploadSessionResponse } from '@pointfinder/api'
import type { PendingMedia, PendingSubmission } from './queue'

/** Implementations commit the full local copy before put resolves. */
export interface MediaStore {
  put(id: string, file: Blob): Promise<void>
  read(id: string, offset: number, length: number): Promise<Uint8Array>
  remove(id: string): Promise<void>
  /** Remove old incomplete/unreferenced copies, preserving every account's queued files. */
  prune?(retainedIds: string[]): Promise<void>
}

export interface MediaUploaderOptions {
  store: MediaStore
  api: PointFinderApi['player']['uploads']
  checkpoint: (actionId: string, media: PendingMedia[]) => Promise<void>
  /** Invoked before every request and after asynchronous storage operations. */
  requireSession: () => void
}

/**
 * Resume using server chunk indexes, including when the previous response was
 * lost. Completion URLs are durable before submission; no fallback drops media.
 */
export async function uploadSubmissionMedia(action: PendingSubmission, options: MediaUploaderOptions): Promise<string[]> {
  const media = (action.media ?? []).map((item) => ({ ...item }))
  const request = async <T>(operation: () => Promise<T>): Promise<T> => {
    options.requireSession()
    const result = await operation()
    options.requireSession()
    return result
  }
  const save = () => options.checkpoint(action.id, media.map((item) => ({ ...item })))
  for (const item of media) {
    if (item.fileUrl) continue
    let session: UploadSessionResponse | undefined
    if (item.sessionId) {
      try { session = await request(() => options.api.get(action.gameId, item.sessionId!)) }
      catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error }
    }
    if (!session || ['expired', 'cancelled', 'failed'].includes(session.status)) {
      session = await request(() => options.api.start(action.gameId, {
        mediaItemKey: item.id, originalFileName: item.name, contentType: item.contentType,
        totalSizeBytes: item.size, chunkSizeBytes: 1024 * 1024,
      }))
    }
    validateSession(session, action.gameId, item)
    item.sessionId = session.sessionId
    item.uploadedBytes = uploadedBytes(session)
    await save()
    if (session.status !== 'completed') {
      if (session.status !== 'active') throw new ApiError({ status: 422, code: 'UPLOAD_SESSION_NOT_ACTIVE', message: 'Upload session is not active' })
      const uploaded = new Set(session.uploadedChunks)
      for (let index = 0; index < session.totalChunks; index++) {
        if (uploaded.has(index)) continue
        options.requireSession()
        const offset = index * session.chunkSizeBytes
        const length = Math.min(session.chunkSizeBytes, item.size - offset)
        const bytes = await options.store.read(item.id, offset, length)
        if (bytes.length !== length) throw new ApiError({ status: 422, code: 'MEDIA_NEEDS_RESELECT', message: 'The saved media is missing or incomplete' })
        session = await request(() => options.api.putChunk(action.gameId, item.sessionId!, index, bytes))
        validateSession(session, action.gameId, item)
        item.uploadedBytes = uploadedBytes(session)
        await save()
      }
      session = await request(() => options.api.complete(action.gameId, item.sessionId!))
    }
    validateSession(session, action.gameId, item)
    if (session.status !== 'completed' || !session.fileUrl) throw new ApiError({ status: 502, code: 'INVALID_RESPONSE', message: 'Upload completion did not return a file' })
    item.fileUrl = session.fileUrl
    item.uploadedBytes = item.size
    await save()
  }
  return [...(action.fileUrls ?? []), ...media.map((item) => item.fileUrl!)]
}

function validateSession(session: UploadSessionResponse, gameId: string, item: PendingMedia) {
  if (session.gameId !== gameId || session.totalSizeBytes !== item.size ||
    (session.mediaItemKey && session.mediaItemKey !== item.id) ||
    !Number.isInteger(session.chunkSizeBytes) || session.chunkSizeBytes < 1024 || session.chunkSizeBytes > 16 * 1024 * 1024 ||
    session.totalChunks !== Math.ceil(item.size / session.chunkSizeBytes)) {
    throw new ApiError({ status: 422, code: 'UPLOAD_METADATA_MISMATCH', message: 'Upload metadata does not match the saved media' })
  }
}

function uploadedBytes(session: UploadSessionResponse): number {
  return [...new Set(session.uploadedChunks)].filter((index) => Number.isInteger(index) && index >= 0 && index < session.totalChunks)
    .reduce((sum, index) => sum + Math.min(session.chunkSizeBytes, session.totalSizeBytes - index * session.chunkSizeBytes), 0)
}
