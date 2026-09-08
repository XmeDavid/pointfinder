import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { watchDeviceOrientation } from './orientation'

const mocks = vi.hoisted(() => ({ native: true, invoke: vi.fn(), listen: vi.fn(), unregister: vi.fn() }))
vi.mock('./runtime', () => ({ isNative: () => mocks.native }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke, addPluginListener: mocks.listen }))
const stops: Array<() => void> = []
const pose = { heading: 359, pitch: 10, roll: -5 }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.native = true
  mocks.invoke.mockResolvedValue(undefined)
  mocks.listen.mockResolvedValue({ unregister: mocks.unregister })
})
afterEach(async () => { stops.splice(0).forEach((stop) => stop()); await settle() })

it('does not access sensors in a browser', async () => {
  mocks.native = false
  stops.push(watchDeviceOrientation(vi.fn()))
  await settle()
  expect(mocks.invoke).not.toHaveBeenCalled()
})

it('shares the sensor, filters invalid readings and stops only after the final consumer leaves', async () => {
  const first = vi.fn()
  const second = vi.fn()
  const stopFirst = watchDeviceOrientation(first)
  const stopSecond = watchDeviceOrientation(second)
  stops.push(stopFirst, stopSecond)
  await settle()
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('plugin:pointfinder-device|start_orientation')
  const emit = mocks.listen.mock.calls[0][2]
  emit(pose)
  emit({ ...pose, heading: NaN })
  emit({ ...pose, pitch: Infinity })
  expect(first).toHaveBeenCalledOnce()
  stopFirst()
  await settle()
  emit({ ...pose, heading: null })
  expect(first).toHaveBeenCalledOnce()
  expect(second).toHaveBeenCalledTimes(2)
  expect(mocks.unregister).not.toHaveBeenCalled()
  stopSecond()
  await settle()
  expect(mocks.invoke).toHaveBeenLastCalledWith('plugin:pointfinder-device|stop_orientation')
  expect(mocks.unregister).toHaveBeenCalledOnce()
})

it('cleans up when a page leaves while native start is still pending', async () => {
  let finish!: () => void
  mocks.invoke.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
  const receive = vi.fn()
  const stop = watchDeviceOrientation(receive)
  stops.push(stop)
  await settle()
  stop()
  mocks.listen.mock.calls[0][2](pose)
  expect(receive).not.toHaveBeenCalled()
  finish()
  await settle()
  expect(mocks.invoke).toHaveBeenLastCalledWith('plugin:pointfinder-device|stop_orientation')
  expect(mocks.unregister).toHaveBeenCalledOnce()
})

it('unregisters on unavailable sensors and can retry on a later visit', async () => {
  mocks.invoke.mockRejectedValueOnce(new Error('unavailable'))
  const stop = watchDeviceOrientation(vi.fn())
  await settle()
  expect(mocks.unregister).toHaveBeenCalledOnce()
  stop()
  await settle()
  stops.push(watchDeviceOrientation(vi.fn()))
  await settle()
  expect(mocks.invoke).toHaveBeenCalledTimes(2)
})
