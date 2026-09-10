import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { OnboardingExperience, type OnboardingExperienceProps } from './OnboardingExperience'
import { ONBOARDING_SEEN_KEY } from './useOnboarding'
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), native: vi.fn() }))
vi.mock('@/platform/runtime', () => ({ isNativeEntry: mocks.native }))
vi.mock('@/platform', () => ({ kv: { get: mocks.get, set: mocks.set } }))
const mount = (props: OnboardingExperienceProps = {}) => render(<MemoryRouter><OnboardingExperience {...props} /></MemoryRouter>)
const experience = () => screen.getByTestId('onboarding-experience')
const click = (id: string) => fireEvent.click(screen.getByTestId(`onboarding-${id}`))
const finish = () => { const count = experience().getAttribute('data-role') === 'organizer' ? 3 : 4; for (let i = 0; i < count; i++) click('next') }
const picture = () => document.querySelector('.onboarding-still')!
beforeEach(async () => { vi.clearAllMocks(); mocks.native.mockReturnValue(true); mocks.get.mockResolvedValue(null); mocks.set.mockResolvedValue(undefined); await i18n.changeLanguage('en') })
afterEach(() => { cleanup(); vi.useRealTimers() })

it('offers both roles with native joining and sign-in directly reachable', () => {
  mount()
  expect(experience()).toHaveAttribute('data-step', 'choice')
  expect(screen.getByRole('link', { name: 'Join a game' })).toHaveAttribute('href', '/join')
  expect(screen.getByRole('link', { name: "I'm an operator" })).toHaveAttribute('href', '/login')
  expect(screen.getByTestId('onboarding-role-organizer')).toBeVisible()
  expect(picture()).toHaveAttribute('src', '/onboarding/stories/participant-map.webp')
  expect(document.querySelector('canvas')).toBeNull()
  expect(mocks.set).not.toHaveBeenCalled()
})
it('navigates four player chapters with dots, back, focus and completion', () => {
  const onFinish = vi.fn(); mount({ play: 'participant', onFinish })
  click('dot-3'); expect(experience()).toHaveAttribute('data-step', 'checkin')
  expect(screen.getByRole('heading')).toHaveFocus()
  expect(screen.getByTestId('onboarding-dot-3')).toHaveAttribute('aria-current', 'step')
  click('back'); expect(experience()).toHaveAttribute('data-step', 'map')
  click('dot-1'); finish()
  expect(experience()).toHaveAttribute('data-step', 'compass')
  expect(onFinish).toHaveBeenCalledExactlyOnceWith('participant', 'completed')
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith(ONBOARDING_SEEN_KEY, JSON.stringify({ version: 2, role: 'participant' }))
  click('replay'); expect(experience()).toHaveAttribute('data-step', 'choice')
})
it('preserves the anonymous organizer gate, three chapters and account landing', () => {
  const onFinish = vi.fn(); mount({ onFinish }); click('role-organizer')
  expect(experience()).toHaveAttribute('data-step', 'gate')
  expect(screen.getByTestId('onboarding-gate-create-account')).toHaveAttribute('href', '/register')
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  expect(mocks.set).not.toHaveBeenCalled(); click('gate-watch')
  expect(picture()).toHaveAttribute('src', '/onboarding/stories/organizer-bases.webp')
  expect(screen.getAllByRole('button', { name: /Go to step/ })).toHaveLength(3)
  for (const chapter of ['plan', 'teams', 'live']) { expect(experience()).toHaveAttribute('data-step', chapter); click('next') }
  expect(screen.getByTestId('onboarding-landing-create-account')).toBeVisible()
  expect(onFinish).toHaveBeenCalledExactlyOnceWith('organizer', 'completed')
})
it('opens pricing directly at the organizer gate and changes roles without recording completion', () => {
  mount({ organizerGate: true }); expect(experience()).toHaveAttribute('data-step', 'gate')
  click('change-role'); click('role-participant'); click('back')
  expect(experience()).toHaveAttribute('data-step', 'choice'); expect(mocks.set).not.toHaveBeenCalled()
})
it('records Skip separately from completion', () => {
  const onFinish = vi.fn(); mount({ play: 'organizer', onFinish }); click('skip')
  expect(onFinish).toHaveBeenCalledExactlyOnceWith('organizer', 'skipped')
})
it('keeps the signed-in operator tour and first-game/dashboard callbacks', () => {
  const operator = { onSkipTour: vi.fn(), onDashboard: vi.fn(), onCreateFirstGame: vi.fn() }
  const onFinish = vi.fn(); mount({ mode: 'operator', operator, onFinish })
  click('tour-skip'); expect(operator.onSkipTour).toHaveBeenCalledOnce(); click('tour-start')
  expect(screen.queryByTestId('onboarding-change-role')).not.toBeInTheDocument()
  expect(screen.queryByTestId('onboarding-back')).not.toBeInTheDocument()
  click('dashboard-link'); expect(operator.onDashboard).toHaveBeenCalledOnce(); finish()
  expect(onFinish).toHaveBeenCalledExactlyOnceWith('organizer', 'completed')
  expect(mocks.set).not.toHaveBeenCalled(); click('first-game'); expect(operator.onCreateFirstGame).toHaveBeenCalledOnce()
  click('dashboard'); expect(operator.onDashboard).toHaveBeenCalledTimes(2)
  click('replay'); expect(experience()).toHaveAttribute('data-step', 'plan')
})
it('offers only the dashboard when a first game is not available', () => {
  mount({ mode: 'operator', play: 'organizer', operator: { onSkipTour: vi.fn(), onDashboard: vi.fn() } }); finish()
  expect(screen.queryByTestId('onboarding-first-game')).not.toBeInTheDocument()
  expect(screen.getByTestId('onboarding-dashboard')).toBeVisible()
})
it('keeps a joined player’s game reachable and remembers their completed tour', () => {
  mount({ mode: 'player' }); expect(screen.getByTestId('onboarding-player-back')).toHaveAttribute('href', '/')
  expect(screen.getAllByRole('link')).toHaveLength(1); finish()
  expect(screen.getByTestId('onboarding-player-back')).toBeVisible(); expect(mocks.set).toHaveBeenCalledOnce()
})
it('keeps browser store downloads and native joining distinct', () => {
  mocks.native.mockReturnValue(false); mount({ play: 'participant' }); finish()
  expect(screen.getByTestId('onboarding-download-ios')).toHaveAttribute('href', expect.stringContaining('apps.apple.com'))
  expect(screen.getByTestId('onboarding-download-android')).toHaveAttribute('href', expect.stringContaining('play.google.com'))
  expect(document.querySelector('a[href="/join"]')).toBeNull()
})
it('remembers existing completed roles without forcing a new onboarding', async () => {
  mocks.get.mockResolvedValue(JSON.stringify({ version: 2, role: 'organizer' })); mount()
  await waitFor(() => expect(experience()).toHaveAttribute('data-step', 'compass'))
  expect(experience()).toHaveAttribute('data-role', 'organizer')
})
it('never lets a late preference read override an interaction', async () => {
  let resolve!: (s: string) => void; mocks.get.mockReturnValue(new Promise<string>((r) => { resolve = r })); mount(); click('role-participant')
  await act(async () => resolve(JSON.stringify({ version: 2, role: 'organizer' })))
  expect(experience()).toHaveAttribute('data-step', 'join')
})
it('allows navigation while images load or fail and supports retry', () => {
  mount({ play: 'participant' }); fireEvent.error(picture())
  expect(screen.getByRole('status')).toHaveTextContent('Illustration unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Retry image' })); fireEvent.load(picture())
  expect(screen.getByTestId('onboarding-scene')).toHaveAttribute('data-state', 'ready')
  click('next'); fireEvent.error(picture()); click('next'); expect(experience()).toHaveAttribute('data-step', 'checkin')
})
it('survives preference failures without blocking the story', async () => {
  mocks.get.mockRejectedValue(new Error('offline')); mocks.set.mockRejectedValue(new Error('offline')); mount(); click('role-participant'); click('skip')
  await act(async () => {}); expect(experience()).toHaveAttribute('data-step', 'compass')
})
it('never auto-advances, including after the illustration loads', async () => {
  vi.useFakeTimers(); mount({ play: 'participant' }); fireEvent.load(picture())
  await act(async () => { vi.advanceTimersByTime(120000) })
  expect(experience()).toHaveAttribute('data-step', 'join')
  expect(screen.queryByTestId('onboarding-autoplay')).not.toBeInTheDocument()
})
it.each(['en', 'pt', 'de'])('changes to %s in place and localizes accessible step navigation', async (lang) => {
  mount({ play: 'organizer' }); click('next'); await act(async () => { await i18n.changeLanguage(lang) })
  expect(experience()).toHaveAttribute('data-step', 'teams')
  expect(screen.getByRole('navigation')).toHaveAccessibleName(i18n.t('playerApp.onboarding.storyNavigation'))
  expect(screen.getByRole('heading')).not.toHaveTextContent('onboarding.')
})
it('preview interactions never read or write preferences', () => {
  const onFinish = vi.fn(); mount({ previewRole: 'organizer', previewStep: 2, onFinish }); click('skip')
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.set).not.toHaveBeenCalled(); expect(onFinish).not.toHaveBeenCalled()
})
