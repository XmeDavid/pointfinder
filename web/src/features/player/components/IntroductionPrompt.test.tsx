import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ONBOARDING_SEEN_KEY } from '@/components/onboarding/useOnboarding'
import { INTRODUCTION_PROMPT_KEY, IntroductionPrompt } from './IntroductionPrompt'

const store = vi.hoisted(() => new Map<string, string>())
const kv = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
}))
vi.mock('@/platform', () => ({ kv }))

const onStart = vi.fn()
const mount = () => render(<MemoryRouter><IntroductionPrompt onStart={onStart} /></MemoryRouter>)
const prompt = () => screen.queryByTestId('player-intro-prompt')

beforeEach(() => {
  store.clear()
  onStart.mockClear()
  kv.get.mockImplementation(async (key: string) => store.get(key) ?? null)
  kv.set.mockImplementation(async (key: string, value: string) => { store.set(key, value) })
})

describe('IntroductionPrompt', () => {
  it('offers contextual guidance once after joining', async () => {
    mount()
    await waitFor(() => expect(prompt()).toBeInTheDocument())
    expect(screen.getByText('Your field guide')).toBeInTheDocument()
    const open = screen.getByTestId('player-intro-prompt-open')
    fireEvent.click(open)
    expect(onStart).toHaveBeenCalledOnce()
    expect(prompt()).not.toBeInTheDocument()
    expect(store.has(INTRODUCTION_PROMPT_KEY)).toBe(true)
  })

  it('remembers "not now"', async () => {
    mount()
    await waitFor(() => expect(prompt()).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('player-intro-prompt-dismiss'))
    expect(prompt()).not.toBeInTheDocument()
    expect(store.has(INTRODUCTION_PROMPT_KEY)).toBe(true)
    const again = mount()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(again.queryByTestId('player-intro-prompt')).not.toBeInTheDocument()
  })

  it('also offers in-game guidance after introductory onboarding', async () => {
    store.set(ONBOARDING_SEEN_KEY, JSON.stringify({ version: 2, role: 'participant' }))
    mount()
    await waitFor(() => expect(prompt()).toBeInTheDocument())
  })

  it('still asks a player who only watched the organizer story', async () => {
    store.set(ONBOARDING_SEEN_KEY, JSON.stringify({ version: 2, role: 'organizer' }))
    mount()
    await waitFor(() => expect(prompt()).toBeInTheDocument())
  })

  it('stays quiet when preferences cannot be read', async () => {
    kv.get.mockRejectedValue(new Error('storage unavailable'))
    mount()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(prompt()).not.toBeInTheDocument()
  })
})
