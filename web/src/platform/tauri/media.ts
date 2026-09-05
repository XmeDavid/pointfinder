import { invoke } from '@tauri-apps/api/core'
import { ApiError } from '@pointfinder/api'
import type { MediaStore } from '@pointfinder/game-core'

export const nativeMediaStore: MediaStore = {
  async put(id, file) {
    try {
      for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
        const bytes = new Uint8Array(await file.slice(offset, offset + 1024 * 1024).arrayBuffer())
        await invoke('media_write', { id, offset, bytes: Array.from(bytes) })
      }
      await invoke('media_commit', { id, size: file.size })
    } catch (error) {
      await invoke('media_remove', { id }).catch(() => {})
      throw error
    }
  },
  async read(id, offset, length) {
    try { return new Uint8Array(await invoke<ArrayBuffer>('media_read', { id, offset, length })) }
    catch (error) {
      if (String(error).startsWith('MEDIA_NEEDS_RESELECT')) throw new ApiError({ status: 422, code: 'MEDIA_NEEDS_RESELECT', message: 'The saved media is missing or incomplete' })
      throw error
    }
  },
  async remove(id) { await invoke('media_remove', { id }) },
  async prune(retainedIds) { await invoke('media_prune', { retainedIds }) },
}
