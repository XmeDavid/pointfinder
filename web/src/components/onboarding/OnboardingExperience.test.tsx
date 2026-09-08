import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { OnboardingExperience, type OnboardingExperienceProps } from './OnboardingExperience'
import { ONBOARDING_SEEN_KEY } from './useOnboarding'

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), renders: vi.fn() }))
vi.mock('@/platform', () => ({ kv: { get: mocks.get, set: mocks.set } }))
vi.mock('./OnboardingScene', () => ({
  OnboardingScene: (props: { branch: string; targetFrame: number; className?: string; onReady: () => void; onError: () => void }) => {
    mocks.renders(props)
    return <div data-testid="scene-mock" className={props.className} data-branch={props.branch} data-frame={props.targetFrame}><button onClick={props.onReady}>scene ready</button><button onClick={props.onError}>scene error</button></div>
  },
}))

function Location() { return <span data-testid="location">{useLocation().pathname}</span> }
const completed = (role: string) => JSON.stringify({ version: 2, role })
function mount(props: OnboardingExperienceProps = {}) {
  return render(<MemoryRouter initialEntries={['/welcome']}><OnboardingExperience {...props} /><Location /></MemoryRouter>)
}
const experience = () => screen.getByTestId('onboarding-experience')
const scene = () => screen.getByTestId('scene-mock')
const still = () => document.querySelector('.onboarding-still')
const links = () => screen.getAllByRole('link').map((link) => link.getAttribute('href'))
const finishChapters = () => { for (let i = 0; i < 6; i++) fireEvent.click(screen.getByTestId('onboarding-next')) }
beforeEach(async () => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue(null)
  mocks.set.mockResolvedValue(undefined)
  await i18n.changeLanguage('en')
})

it('opens on the role choice with both stories, and joining or signing in one tap away', async () => {
  mount()
  expect(experience()).toHaveAttribute('data-role', 'choice')
  expect(experience()).toHaveAttribute('data-step', 'choice')
  expect(experience()).toHaveAttribute('data-mode', 'anonymous')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Playing or organizing?')
  const group = screen.getByRole('group', { name: 'Playing or organizing?' })
  const [participant, organizer] = within(group).getAllByRole('button')
  expect(participant).toBe(screen.getByTestId('onboarding-role-participant'))
  expect(organizer).toBe(screen.getByTestId('onboarding-role-organizer'))
  expect(participant).toHaveTextContent('I’m participating')
  expect(participant).toHaveTextContent('Join a team, find bases and solve challenges.')
  expect(organizer).toHaveTextContent('I’m organizing')
  expect(screen.getByRole('link', { name: 'Join a game' })).toHaveAttribute('href', '/join')
  expect(screen.getByRole('link', { name: "I'm an operator" })).toHaveAttribute('href', '/login')
  expect(screen.queryByTestId('onboarding-skip')).not.toBeInTheDocument()
  expect(screen.queryByTestId('onboarding-next')).not.toBeInTheDocument()
  expect(still()).toHaveAttribute('src', '/onboarding/role-choice.webp')
  await waitFor(() => expect(scene()).toHaveAttribute('data-branch', 'choice'))
  expect(scene()).toHaveAttribute('data-frame', '125')
  expect(mocks.set).not.toHaveBeenCalled()
})

it('takes a participant straight to joining a game without remembering anything', async () => {
  mount()
  await screen.findByTestId('scene-mock')
  fireEvent.click(screen.getByTestId('onboarding-role-participant'))
  expect(screen.getByTestId('location')).toHaveTextContent('/join')
  expect(mocks.set).not.toHaveBeenCalled()
})

it('offers an organizer an account, a sign-in, or watching first, with the story behind it', async () => {
  const onFinish = vi.fn()
  mount({ onFinish })
  await screen.findByTestId('scene-mock')
  fireEvent.click(screen.getByTestId('onboarding-role-organizer'))
  expect(experience()).toHaveAttribute('data-role', 'organizer')
  expect(experience()).toHaveAttribute('data-step', 'gate')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ready to organize?')
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  expect(scene()).toHaveAttribute('data-branch', 'organizer')
  expect(scene()).toHaveAttribute('data-frame', '125')
  expect(still()).toHaveAttribute('src', '/onboarding/organizer-step-1.webp')
  expect(screen.getByTestId('onboarding-gate-create-account')).toHaveAttribute('href', '/register')
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  expect(screen.queryByTestId('onboarding-next')).not.toBeInTheDocument()
  expect(mocks.set).not.toHaveBeenCalled()
  // The gate can be left for the role choice again.
  fireEvent.click(screen.getByTestId('onboarding-change-role'))
  expect(experience()).toHaveAttribute('data-step', 'choice')
  fireEvent.click(screen.getByTestId('onboarding-role-organizer'))
  fireEvent.click(screen.getByTestId('onboarding-gate-watch'))
  expect(experience()).toHaveAttribute('data-step', 'plan')
  expect(scene()).toHaveAttribute('data-frame', '125')
  expect(onFinish).not.toHaveBeenCalled()
})

it('tells the organizer story with chapter-specific transitions and an account landing that is handed on', async () => {
  const onFinish = vi.fn()
  mount({ onFinish })
  await screen.findByTestId('scene-mock')
  fireEvent.click(screen.getByTestId('onboarding-role-organizer'))
  fireEvent.click(screen.getByTestId('onboarding-gate-watch'))
  const chapters = [
    ['plan', 'Plan your game', 'Place bases', 125],
    ['bases', 'Place your bases', 'Connect challenges', 301],
    ['challenges', 'Create and connect challenges', 'Invite teams', 371],
    ['teams', 'Invite your teams', 'Go live', 465],
    ['live', 'Run the game', 'Review results', 580],
    ['review', 'Review and celebrate', 'Let’s go', 765],
  ] as const
  for (const [id, title, next, frame] of chapters) {
    expect(experience()).toHaveAttribute('data-step', id)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title)
    expect(screen.getByTestId('onboarding-next')).toHaveTextContent(next)
    expect(scene()).toHaveAttribute('data-frame', String(frame))
    expect(screen.getByTestId('onboarding-change-role')).toBeInTheDocument()
    expect(links()).toEqual(['/join', '/login'])
    fireEvent.click(screen.getByTestId('onboarding-next'))
  }
  expect(experience()).toHaveAttribute('data-step', 'compass')
  expect(scene()).toHaveAttribute('data-frame', '864')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your game, your world')
  // The landing leads with the account, keeps sign-in, and nothing points at joining.
  expect(links()).toEqual(['/register', '/login'])
  expect(screen.getByTestId('onboarding-landing-create-account')).toHaveTextContent('Create an account')
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith(ONBOARDING_SEEN_KEY, completed('organizer'))
  expect(onFinish).toHaveBeenCalledExactlyOnceWith('organizer', 'completed')
  fireEvent.click(screen.getByTestId('onboarding-replay'))
  expect(experience()).toHaveAttribute('data-role', 'choice')
})

it('opens straight on a story when asked to play it, with the participant landing leading to joining', async () => {
  const onFinish = vi.fn()
  mount({ play: 'participant', onFinish })
  expect(experience()).toHaveAttribute('data-role', 'participant')
  expect(experience()).toHaveAttribute('data-step', 'join')
  expect(mocks.get).not.toHaveBeenCalled()
  await screen.findByTestId('scene-mock')
  fireEvent.click(screen.getByText('scene ready'))
  expect(screen.getByTestId('onboarding-next')).toHaveTextContent('Continue')
  expect(screen.getByTestId('onboarding-back')).toBeEnabled()
  fireEvent.click(screen.getByTestId('onboarding-back'))
  expect(experience()).toHaveAttribute('data-step', 'choice')
  fireEvent.click(screen.getByTestId('onboarding-role-organizer'))
  fireEvent.click(screen.getByTestId('onboarding-change-role'))
  fireEvent.click(screen.getByTestId('onboarding-role-organizer'))
  fireEvent.click(screen.getByTestId('onboarding-gate-watch'))
  fireEvent.click(screen.getByTestId('onboarding-next'))
  fireEvent.click(screen.getByTestId('onboarding-skip'))
  expect(experience()).toHaveAttribute('data-step', 'compass')
  expect(experience()).toHaveAttribute('data-role', 'organizer')
  expect(onFinish).toHaveBeenCalledExactlyOnceWith('organizer', 'skipped')
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith(ONBOARDING_SEEN_KEY, completed('organizer'))
})

it('opens the organizer gate directly for pricing links', async () => {
  mount({ organizerGate: true })
  expect(experience()).toHaveAttribute('data-step', 'gate')
  expect(experience()).toHaveAttribute('data-role', 'organizer')
  expect(mocks.get).not.toHaveBeenCalled()
  await screen.findByTestId('scene-mock')
  expect(scene()).toHaveAttribute('data-branch', 'organizer')
})

it('gives a signed-in operator the tour offer, then the story, with the first game or the dashboard at the end', async () => {
  const operator = { onSkipTour: vi.fn(), onDashboard: vi.fn(), onCreateFirstGame: vi.fn() }
  const onFinish = vi.fn()
  mount({ mode: 'operator', operator, onFinish })
  expect(experience()).toHaveAttribute('data-mode', 'operator')
  expect(experience()).toHaveAttribute('data-step', 'gate')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Take a quick tour?')
  expect(screen.queryByTestId('onboarding-change-role')).not.toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(mocks.get).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('onboarding-tour-skip'))
  expect(operator.onSkipTour).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByTestId('onboarding-tour-start'))
  expect(experience()).toHaveAttribute('data-step', 'plan')
  // No role choice to go back to on the first chapter, and the dashboard is the quiet way out.
  expect(screen.queryByTestId('onboarding-back')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('onboarding-dashboard-link'))
  expect(operator.onDashboard).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByTestId('onboarding-next'))
  expect(screen.getByTestId('onboarding-back')).toBeInTheDocument()
  for (let i = 0; i < 5; i++) fireEvent.click(screen.getByTestId('onboarding-next'))
  expect(experience()).toHaveAttribute('data-step', 'compass')
  expect(screen.getByText('Every base, challenge and team is yours to shape. Your first game starts on the dashboard.')).toBeInTheDocument()
  expect(onFinish).toHaveBeenCalledExactlyOnceWith('organizer', 'completed')
  expect(mocks.set).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('onboarding-first-game'))
  expect(operator.onCreateFirstGame).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByTestId('onboarding-dashboard'))
  expect(operator.onDashboard).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByTestId('onboarding-replay'))
  expect(experience()).toHaveAttribute('data-step', 'plan')
  expect(experience()).toHaveAttribute('data-role', 'organizer')
})

it('plays the story straight away for a fresh registration and leads only to the dashboard once the first game is done', () => {
  const operator = { onSkipTour: vi.fn(), onDashboard: vi.fn() }
  mount({ mode: 'operator', play: 'organizer', operator })
  expect(experience()).toHaveAttribute('data-step', 'plan')
  finishChapters()
  expect(experience()).toHaveAttribute('data-step', 'compass')
  expect(screen.queryByTestId('onboarding-first-game')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('onboarding-dashboard'))
  expect(operator.onDashboard).toHaveBeenCalledOnce()
})

it('shows a joined player the participant story with their game one tap away', () => {
  const onFinish = vi.fn()
  mount({ mode: 'player', play: 'participant', onFinish })
  expect(experience()).toHaveAttribute('data-mode', 'player')
  expect(experience()).toHaveAttribute('data-step', 'join')
  expect(screen.getByTestId('onboarding-player-back')).toHaveAttribute('href', '/')
  expect(links()).toEqual(['/'])
  finishChapters()
  expect(experience()).toHaveAttribute('data-step', 'compass')
  expect(screen.getByTestId('onboarding-player-back')).toHaveTextContent('Back to your game')
  expect(links()).toEqual(['/'])
  // Watching as a player counts as the participant story on this device, so the map stops asking.
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith(ONBOARDING_SEEN_KEY, completed('participant'))
  expect(onFinish).toHaveBeenCalledExactlyOnceWith('participant', 'completed')
  fireEvent.click(screen.getByTestId('onboarding-replay'))
  expect(experience()).toHaveAttribute('data-step', 'join')
})

it('shows the new branch still until the renderer is ready again, and retries a failed renderer on a branch change', async () => {
  mount()
  await screen.findByTestId('scene-mock')
  fireEvent.click(screen.getByText('scene ready'))
  expect(still()).toBeNull()
  fireEvent.click(screen.getByTestId('onboarding-role-organizer'))
  expect(still()).toHaveAttribute('src', '/onboarding/organizer-step-1.webp')
  expect(screen.getByRole('status')).toHaveTextContent('Loading the animation…')
  expect(scene()).toHaveClass('invisible')
  fireEvent.click(screen.getByText('scene ready'))
  expect(still()).toBeNull()
  expect(scene()).not.toHaveClass('invisible')
  fireEvent.click(screen.getByText('scene error'))
  expect(screen.queryByTestId('scene-mock')).not.toBeInTheDocument()
  expect(still()).toHaveAttribute('src', '/onboarding/organizer-step-1.webp')
  fireEvent.click(screen.getByTestId('onboarding-change-role'))
  expect(still()).toHaveAttribute('src', '/onboarding/role-choice.webp')
  await screen.findByTestId('scene-mock')
  expect(screen.getByRole('status')).toHaveTextContent('Loading the animation…')
})

it('opens returning participants and organizers directly on their own landing', async () => {
  mocks.get.mockResolvedValue(completed('participant'))
  const participant = mount()
  await waitFor(() => expect(scene()).toHaveAttribute('data-frame', '864'))
  expect(experience()).toHaveAttribute('data-role', 'participant')
  expect(mocks.renders.mock.calls.every(([props]) => props.targetFrame === 864 && props.branch === 'participant')).toBe(true)
  expect(links()).toEqual(['/join', '/login'])
  participant.unmount()
  mocks.renders.mockClear()
  mocks.get.mockResolvedValue(completed('organizer'))
  mount()
  await waitFor(() => expect(scene()).toHaveAttribute('data-branch', 'organizer'))
  expect(experience()).toHaveAttribute('data-step', 'compass')
  expect(links()).toEqual(['/register', '/login'])
})

it('shows earlier visitors who completed the single story the new role choice once', async () => {
  mocks.get.mockResolvedValue('true')
  mount()
  await screen.findByTestId('scene-mock')
  expect(experience()).toHaveAttribute('data-role', 'choice')
  expect(mocks.get).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY)
})

it('does not allow a late preference read to override an interaction', async () => {
  let finish: (value: string) => void = () => {}
  mocks.get.mockReturnValue(new Promise<string>((resolve) => { finish = resolve }))
  mount()
  fireEvent.click(screen.getByTestId('onboarding-role-organizer'))
  fireEvent.click(screen.getByTestId('onboarding-gate-watch'))
  fireEvent.click(screen.getByTestId('onboarding-next'))
  await act(async () => { finish(completed('participant')) })
  expect(experience()).toHaveAttribute('data-role', 'organizer')
  expect(experience()).toHaveAttribute('data-step', 'bases')
})

it('survives rejected preference reads and writes and a failed renderer with retry', async () => {
  mocks.get.mockRejectedValue(new Error('storage unavailable'))
  mocks.set.mockRejectedValue(new Error('storage unavailable'))
  mount({ play: 'participant' })
  await screen.findByTestId('scene-mock')
  fireEvent.click(screen.getByText('scene error'))
  expect(screen.queryByTestId('scene-mock')).not.toBeInTheDocument()
  expect(screen.getByText('Animation unavailable. You can still explore every step.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry animation' }))
  await screen.findByTestId('scene-mock')
  fireEvent.click(screen.getByTestId('onboarding-skip'))
  await waitFor(() => expect(experience()).toHaveAttribute('data-step', 'compass'))
})

it('changes language in place without restarting either world', async () => {
  mount()
  await screen.findByTestId('scene-mock')
  fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'de' } })
  await screen.findByRole('heading', { name: 'Mitspielen oder organisieren?' })
  expect(screen.getByTestId('onboarding-role-organizer')).toHaveTextContent('Ich organisiere')
  fireEvent.click(screen.getByTestId('onboarding-role-organizer'))
  await screen.findByRole('heading', { name: 'Bereit zum Organisieren?' })
  expect(screen.getByTestId('onboarding-gate-create-account')).toHaveTextContent('Konto erstellen')
  fireEvent.click(screen.getByTestId('onboarding-gate-watch'))
  fireEvent.click(screen.getByTestId('onboarding-next'))
  await screen.findByRole('heading', { name: 'Platziere deine Stationen' })
  expect(screen.getByTestId('onboarding-next')).toHaveTextContent('Aufgaben verknüpfen')
  expect(screen.getByTestId('onboarding-change-role')).toHaveTextContent('Rolle wechseln')
  fireEvent.change(screen.getByRole('combobox', { name: 'Sprache' }), { target: { value: 'pt' } })
  await screen.findByRole('heading', { name: 'Coloca as tuas bases' })
  expect(screen.getByTestId('onboarding-next')).toHaveTextContent('Ligar desafios')
  expect(scene()).toHaveAttribute('data-branch', 'organizer')
  expect(scene()).toHaveAttribute('data-frame', '301')
  expect(mocks.renders.mock.calls.every(([props]) => props.branch !== 'participant')).toBe(true)
})

it('never loads the moving renderer when reduced motion is requested and swaps stills per branch', async () => {
  const original = window.matchMedia
  window.matchMedia = (query) => ({ ...original(query), matches: true })
  try {
    mount()
    await act(async () => {})
    expect(screen.queryByTestId('scene-mock')).not.toBeInTheDocument()
    expect(mocks.renders).not.toHaveBeenCalled()
    expect(still()).toHaveAttribute('src', '/onboarding/role-choice.webp')
    fireEvent.click(screen.getByTestId('onboarding-role-organizer'))
    expect(still()).toHaveAttribute('src', '/onboarding/organizer-step-1.webp')
    fireEvent.click(screen.getByTestId('onboarding-gate-watch'))
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(still()).toHaveAttribute('src', '/onboarding/organizer-step-2.webp')
    fireEvent.click(screen.getByTestId('onboarding-skip'))
    expect(still()).toHaveAttribute('src', '/onboarding/step-7.webp')
    expect(screen.getByRole('status')).toHaveTextContent('Reduced motion')
    expect(mocks.renders).not.toHaveBeenCalled()
  } finally { window.matchMedia = original }
})

it('previews any branch, chapter or gate without touching preferences', async () => {
  const choice = mount({ previewRole: 'choice' })
  expect(experience()).toHaveAttribute('data-role', 'choice')
  await waitFor(() => expect(scene()).toHaveAttribute('data-branch', 'choice'))
  choice.unmount()
  const gate = mount({ previewGate: true, mode: 'operator', operator: { onSkipTour: vi.fn(), onDashboard: vi.fn() } })
  expect(experience()).toHaveAttribute('data-step', 'gate')
  expect(screen.getByTestId('onboarding-tour-start')).toBeInTheDocument()
  // (Each preview waits for its renderer before unmounting: vitest hands the
  // real module to a dynamic import that follows one abandoned mid-flight.)
  await waitFor(() => expect(scene()).toHaveAttribute('data-branch', 'organizer'))
  gate.unmount()
  const organizer = mount({ previewRole: 'organizer', previewStep: 2 })
  expect(experience()).toHaveAttribute('data-step', 'challenges')
  await waitFor(() => expect(scene()).toHaveAttribute('data-branch', 'organizer'))
  fireEvent.click(screen.getByTestId('onboarding-skip'))
  expect(experience()).toHaveAttribute('data-step', 'compass')
  organizer.unmount()
  mount({ previewStep: 6 })
  expect(experience()).toHaveAttribute('data-role', 'participant')
  expect(experience()).toHaveAttribute('data-step', 'compass')
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.set).not.toHaveBeenCalled()
})
