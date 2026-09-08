import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ONBOARDING_SEEN_KEY, parseCompletedRole, useOnboarding, type OnboardingOptions } from './useOnboarding'

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('@/platform', () => ({ kv: { get: mocks.get, set: mocks.set } }))
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(null); mocks.set.mockResolvedValue(undefined) })
afterEach(() => vi.useRealTimers())

const completed = (role: string) => JSON.stringify({ version: 2, role })
/** The anonymous welcome: a role choice, a remembered landing, local memory. */
const anonymous = (extra: Partial<OnboardingOptions> = {}): OnboardingOptions => ({ resume: true, remember: true, roleChoice: true, ...extra })

it('reads only the v2 role record, so v1 visitors and damaged values see the role choice', () => {
  expect(ONBOARDING_SEEN_KEY).toBe('player.onboarding.expanding-world.v2')
  expect(parseCompletedRole(null)).toBeNull()
  expect(parseCompletedRole('true')).toBeNull()
  expect(parseCompletedRole('{not json')).toBeNull()
  expect(parseCompletedRole(JSON.stringify({ version: 1, role: 'participant' }))).toBeNull()
  expect(parseCompletedRole(JSON.stringify({ version: 2, role: 'admin' }))).toBeNull()
  expect(parseCompletedRole(completed('participant'))).toBe('participant')
  expect(parseCompletedRole(completed('organizer'))).toBe('organizer')
})

it('starts on the role choice and opens a completed role directly on its landing', async () => {
  const fresh = renderHook(() => useOnboarding(anonymous()))
  expect(fresh.result.current).toMatchObject({ branch: 'choice', stage: 'choice' })
  await waitFor(() => expect(fresh.result.current.loaded).toBe(true))
  expect(fresh.result.current.branch).toBe('choice')
  expect(mocks.get).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY)
  fresh.unmount()

  mocks.get.mockResolvedValue(completed('organizer'))
  const returning = renderHook(() => useOnboarding(anonymous()))
  await waitFor(() => expect(returning.result.current.loaded).toBe(true))
  expect(returning.result.current).toMatchObject({ branch: 'organizer', step: 6, stage: 'landing' })
})

it('never reads the remembered role when told where to open, and is loaded at once', () => {
  const play = renderHook(() => useOnboarding(anonymous({ start: { branch: 'participant' }, resume: false })))
  expect(play.result.current).toMatchObject({ branch: 'participant', step: 0, stage: 'chapter', loaded: true })
  play.unmount()
  const gate = renderHook(() => useOnboarding(anonymous({ start: { branch: 'organizer', gate: true }, resume: false })))
  expect(gate.result.current).toMatchObject({ branch: 'organizer', step: 0, stage: 'gate', loaded: true })
  expect(mocks.get).not.toHaveBeenCalled()
})

it('unblocks the scene after a stalled settings read without a late jump to the landing', async () => {
  vi.useFakeTimers()
  let complete: (value: string) => void = () => {}
  mocks.get.mockReturnValue(new Promise<string>((resolve) => { complete = resolve }))
  const { result } = renderHook(() => useOnboarding(anonymous()))
  expect(result.current.loaded).toBe(false)
  await act(async () => { vi.advanceTimersByTime(1200) })
  expect(result.current.loaded).toBe(true)
  await act(async () => { complete(completed('participant')) })
  expect(result.current).toMatchObject({ branch: 'choice', step: 0 })
})

it('never lets a late read override a role the user already chose', async () => {
  let complete: (value: string) => void = () => {}
  mocks.get.mockReturnValue(new Promise<string>((resolve) => { complete = resolve }))
  const { result } = renderHook(() => useOnboarding(anonymous()))
  act(() => result.current.chooseRole('organizer', { gate: true }))
  expect(result.current.loaded).toBe(true)
  await act(async () => { complete(completed('participant')) })
  expect(result.current).toMatchObject({ branch: 'organizer', step: 0, stage: 'gate' })
})

it('remembers completion or skip with the role and reports each once, never a mere choice or gate', async () => {
  const onFinish = vi.fn()
  const { result } = renderHook(() => useOnboarding(anonymous({ onFinish })))
  await waitFor(() => expect(result.current.loaded).toBe(true))
  act(() => result.current.chooseRole('organizer', { gate: true }))
  expect(result.current.stage).toBe('gate')
  act(() => result.current.openChapters())
  expect(result.current).toMatchObject({ branch: 'organizer', step: 0, stage: 'chapter' })
  expect(mocks.set).not.toHaveBeenCalled()
  act(() => result.current.go(-1))
  expect(result.current.branch).toBe('choice')
  act(() => result.current.chooseRole('organizer'))
  act(() => result.current.go(1))
  act(() => result.current.changeRole())
  expect(result.current).toMatchObject({ branch: 'choice', step: 0 })
  expect(mocks.set).not.toHaveBeenCalled()
  expect(onFinish).not.toHaveBeenCalled()

  act(() => result.current.chooseRole('participant'))
  for (let step = 1; step <= 6; step++) act(() => result.current.go(step))
  expect(result.current).toMatchObject({ branch: 'participant', step: 6, stage: 'landing' })
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith(ONBOARDING_SEEN_KEY, completed('participant'))
  expect(onFinish).toHaveBeenCalledExactlyOnceWith('participant', 'completed')

  act(() => result.current.changeRole())
  expect(result.current.branch).toBe('choice')
  act(() => result.current.chooseRole('organizer'))
  act(() => result.current.skip())
  expect(result.current).toMatchObject({ branch: 'organizer', step: 6, stage: 'landing' })
  expect(mocks.set).toHaveBeenLastCalledWith(ONBOARDING_SEEN_KEY, completed('organizer'))
  expect(onFinish).toHaveBeenLastCalledWith('organizer', 'skipped')
  expect(onFinish).toHaveBeenCalledTimes(2)
})

it('treats a skip from the role choice as the participant story', async () => {
  const { result } = renderHook(() => useOnboarding(anonymous()))
  await waitFor(() => expect(result.current.loaded).toBe(true))
  act(() => result.current.skip())
  expect(result.current).toMatchObject({ branch: 'participant', step: 6 })
  expect(mocks.set).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY, completed('participant'))
})

it('without a role choice, back and replay return to the first chapter and nothing is written locally', () => {
  const onFinish = vi.fn()
  const { result } = renderHook(() => useOnboarding({ start: { branch: 'organizer', gate: true }, roleChoice: false, onFinish }))
  act(() => result.current.openChapters())
  act(() => result.current.go(-1))
  expect(result.current).toMatchObject({ branch: 'organizer', step: 0, stage: 'chapter' })
  for (let step = 1; step <= 6; step++) act(() => result.current.go(step))
  expect(result.current.stage).toBe('landing')
  expect(onFinish).toHaveBeenCalledExactlyOnceWith('organizer', 'completed')
  act(() => result.current.changeRole())
  expect(result.current).toMatchObject({ branch: 'organizer', step: 0, stage: 'chapter' })
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.set).not.toHaveBeenCalled()
})

it('survives rejected reads and writes', async () => {
  mocks.get.mockRejectedValue(new Error('storage unavailable'))
  mocks.set.mockRejectedValue(new Error('storage unavailable'))
  const { result } = renderHook(() => useOnboarding(anonymous()))
  await waitFor(() => expect(result.current.loaded).toBe(true))
  act(() => result.current.chooseRole('participant'))
  act(() => result.current.go(6))
  await act(async () => {})
  expect(result.current).toMatchObject({ branch: 'participant', step: 6 })
})

it('uses fixtures for previews and never reads or persists there', () => {
  const onFinish = vi.fn()
  const choice = renderHook(() => useOnboarding({ preview: { role: 'choice' }, onFinish }))
  expect(choice.result.current).toMatchObject({ branch: 'choice', step: 0, loaded: true, preview: true })
  choice.unmount()
  const gate = renderHook(() => useOnboarding({ preview: { gate: true } }))
  expect(gate.result.current).toMatchObject({ branch: 'organizer', stage: 'gate', preview: true })
  gate.unmount()
  const organizer = renderHook(() => useOnboarding({ preview: { role: 'organizer', step: 3 }, onFinish }))
  expect(organizer.result.current).toMatchObject({ branch: 'organizer', step: 3 })
  act(() => organizer.result.current.go(6))
  expect(organizer.result.current.step).toBe(6)
  organizer.unmount()
  const participant = renderHook(() => useOnboarding({ preview: { step: 4 }, onFinish }))
  expect(participant.result.current).toMatchObject({ branch: 'participant', step: 4 })
  act(() => participant.result.current.skip())
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.set).not.toHaveBeenCalled()
  expect(onFinish).not.toHaveBeenCalled()
})
