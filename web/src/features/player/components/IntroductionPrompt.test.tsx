import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ONBOARDING_SEEN_KEY } from '@/components/onboarding/useOnboarding'
import { INTRODUCTION_PROMPT_KEY, IntroductionPrompt, PARTICIPANT_STORY_ROUTE } from './IntroductionPrompt'

const store = vi.hoisted(() => new Map<string, string>())
const kv = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
}))
vi.mock('@/platform', () => ({ kv }))

const mount = () => render(<MemoryRouter><IntroductionPrompt /></MemoryRouter>)
const prompt = () => screen.queryByTestId('player-intro-prompt')

beforeEach(() => {
  store.clear()
  kv.get.mockImplementation(async (key: string) => store.get(key) ?? null)
  kv.set.mockImplementation(async (key: string, value: string) => { store.set(key, value) })
})

describe('IntroductionPrompt', () => {
  it('offers the participant story once after joining, and opens it', async () => {
    mount()
    await waitFor(() => expect(prompt()).toBeInTheDocument())
    expect(screen.getByText('New to PointFinder?')).toBeInTheDocument()
    const open = screen.getByTestId('player-intro-prompt-open')
    expect(open).toHaveAttribute('href', PARTICIPANT_STORY_ROUTE)
    fireEvent.click(open)
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

  it('stays quiet for a player who already watched the participant story on this device', async () => {
    store.set(ONBOARDING_SEEN_KEY, JSON.stringify({ version: 2, role: 'participant' }))
    mount()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(prompt()).not.toBeInTheDocument()
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
