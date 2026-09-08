import { isNative } from './runtime'

/** Decorative compass pose, in degrees. Heading is magnetic, clockwise from north. */
export interface DeviceOrientation { heading: number | null; pitch: number; roll: number }
type Subscriber = (pose: DeviceOrientation) => void
const subscribers = new Set<Subscriber>()
let transitions = Promise.resolve()
let disconnect: (() => Promise<void>) | undefined

function valid(pose: DeviceOrientation): boolean {
  return !!pose && (pose.heading === null || Number.isFinite(pose.heading))
    && Number.isFinite(pose.pitch) && Number.isFinite(pose.roll)
}

/** Share one native sensor subscription. Serialize start/stop across route and StrictMode churn. */
export function watchDeviceOrientation(subscriber: Subscriber): () => void {
  // Browsers retain the decorative idle animation without prompting for sensors.
  if (!isNative()) return () => {}
  subscribers.add(subscriber)
  reconcile()
  return () => { subscribers.delete(subscriber); reconcile() }
}

function reconcile() {
  transitions = transitions.then(async () => {
    if (!subscribers.size) {
      const stop = disconnect
      disconnect = undefined
      await stop?.()
      return
    }
    if (disconnect) return
    const { invoke, addPluginListener } = await import('@tauri-apps/api/core')
    const listener = await addPluginListener<DeviceOrientation>('pointfinder-device', 'orientation', (pose) => {
      if (valid(pose)) subscribers.forEach((subscriber) => subscriber(pose))
    })
    try {
      await invoke('plugin:pointfinder-device|start_orientation')
      disconnect = async () => {
        try { await invoke('plugin:pointfinder-device|stop_orientation') }
        finally { await listener.unregister() }
      }
    } catch {
      await listener.unregister()
    }
  }).catch(() => { /* Unavailable sensor/desktop shell: keep the idle compass. */ })
}
