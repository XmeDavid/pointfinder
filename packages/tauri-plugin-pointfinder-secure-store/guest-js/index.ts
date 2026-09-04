import { invoke } from '@tauri-apps/api/core'

const CMD = 'plugin:pointfinder-secure-store|'

/** Read a secret. Returns null when the key is absent or can no longer be decrypted. */
export async function get(key: string): Promise<string | null> {
  const r = await invoke<{ value?: string | null }>(`${CMD}get`, { key })
  return r.value ?? null
}

export async function set(key: string, value: string): Promise<void> {
  await invoke(`${CMD}set`, { key, value })
}

export async function remove(key: string): Promise<void> {
  await invoke(`${CMD}remove`, { key })
}

/** Remove every key this app wrote. Other apps' keychain items are untouched. */
export async function clear(): Promise<void> {
  await invoke(`${CMD}clear`)
}

export async function keys(): Promise<string[]> {
  const r = await invoke<{ keys: string[] }>(`${CMD}keys`)
  return r.keys
}
