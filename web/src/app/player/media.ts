import { ApiError, type AuthState } from '@pointfinder/api'
import type { MediaStore, OfflineQueue, PendingMedia, PendingSubmission } from '@pointfinder/game-core'

export interface MediaSubmissionInput {
  id: string
  gameId: string
  baseId: string
  challengeId: string
  answer: string
  files: File[]
  fileUrls?: string[]
}

export function createMediaService(store: MediaStore, queue: OfflineQueue, auth: () => AuthState) {
  const staging = new Map<string, Promise<PendingSubmission>>()
  return {
    enqueueSubmission(input: MediaSubmissionInput): Promise<PendingSubmission> {
      const existing = staging.get(input.id)
      if (existing) return existing
      const run = (async () => {
        const owner = auth()
        if (owner.kind !== 'player' || owner.gameId !== input.gameId) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED', message: 'A player session for this game is required' })
        const queued = (await queue.list()).find((a) => a.id === input.id)
        if (queued?.type === 'submission') return queued
        const media: PendingMedia[] = []
        try {
          for (const file of input.files) {
            if (file.size === 0) throw new ApiError({ status: 422, code: 'MEDIA_EMPTY', message: 'Selected media is empty' })
            const item = { id: crypto.randomUUID(), name: file.name, contentType: file.type || 'application/octet-stream', size: file.size, uploadedBytes: 0 }
            // Include before writing so failed/partial copies are cleaned up too.
            media.push(item)
            await store.put(item.id, file)
          }
          const current = auth()
          if (current.kind !== 'player' || current.playerId !== owner.playerId || current.token !== owner.token) {
            throw new ApiError({ status: 401, code: 'UNAUTHENTICATED', message: 'Player session changed while saving media' })
          }
          return await queue.enqueueSubmission({ id: input.id, gameId: input.gameId, baseId: input.baseId, challengeId: input.challengeId, answer: input.answer, fileUrls: input.fileUrls, media })
        } catch (error) {
          await Promise.allSettled(media.map((item) => store.remove(item.id)))
          throw error
        }
      })().finally(() => staging.delete(input.id))
      staging.set(input.id, run)
      return run
    },
  }
}

export type PlayerMediaService = ReturnType<typeof createMediaService>
