import type { KeyValueStore } from '@/platform/contracts'
import * as secure from 'tauri-plugin-pointfinder-secure-store-api'

/** Small secrets (device id) in the Keychain / Android Keystore. Session tokens use SecureTokenStore. */
export const secureKv: KeyValueStore = {
  get: (key) => secure.get(key),
  set: (key, value) => secure.set(key, value),
  remove: (key) => secure.remove(key),
}
