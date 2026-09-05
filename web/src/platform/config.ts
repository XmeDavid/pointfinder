import { isNative } from './runtime'

/** VITE_API_URL always denotes the API root, on both deployment targets. */
export const API_URL = (import.meta.env.VITE_API_URL || (isNative() || import.meta.env.VITE_NATIVE_BUILD ? 'https://pointfinder.pt/api' : '/api')).replace(/\/+$/, '')
export function apiOrigin(): string {
  return new URL(API_URL.replace(/\/api$/, '' ) || '/', window.location.origin).href.replace(/\/$/, '')
}
export function brokerUrl(): string {
  const configured = import.meta.env.VITE_WS_URL || '/ws-native'
  const url = new URL(configured, apiOrigin())
  url.protocol = url.protocol === 'https:' ? 'wss:' : url.protocol === 'http:' ? 'ws:' : url.protocol
  return url.href
}
