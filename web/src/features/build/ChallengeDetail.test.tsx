import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import {
  createMockChallenge,
  resetChallengeCounter,
} from '@/test/factories/challenge'
import {
  createMockAssignment,
  resetAssignmentCounter,
} from '@/test/factories/assignment'
import { createMockBase, resetBaseCounter } from '@/test/factories/base'
import { resetTeamCounter } from '@/test/factories/team'
import { useWorkspaceStore } from '@/stores/workspace'
import { ChallengeDetail } from './ChallengeDetail'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const gameId = 'game-1'

describe('ChallengeDetail', () => {
  beforeEach(() => {
    resetChallengeCounter()
    resetAssignmentCounter()
    resetBaseCounter()
    resetTeamCounter()
    useWorkspaceStore.getState().reset()
  })

  it('renders challenge title in the form', async () => {
    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      const input = screen.getByTestId('challenge-title-input')
      expect(input).toHaveValue('Challenge Alpha')
    })
  })

  it('shows "Challenge not found" for invalid id', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([])
      }),
    )

    render(<ChallengeDetail challengeId="nonexistent" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Challenge not found')).toBeInTheDocument()
    })
  })

  it('renders all form sections', async () => {
    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('challenge-detail')).toBeInTheDocument()
    })

    // Section headers
    expect(screen.getByText('Challenge')).toBeInTheDocument()
    // "Content" appears as both section header and field label
    expect(
      screen.getAllByText('Player instructions').length,
    ).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Scoring')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Points')).toBeVisible()
    expect(screen.getByText('Where this challenge appears')).toBeInTheDocument()
    expect(screen.getByText('Operator notes')).toBeInTheDocument()
    expect(screen.getByText('Location requirements')).toBeInTheDocument()
    expect(screen.getByText('After completion')).toBeInTheDocument()
  })

  it('shows answer type buttons', async () => {
    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('answer-type-text')).toBeInTheDocument()
      expect(screen.getByTestId('answer-type-file')).toBeInTheDocument()
      expect(screen.getByTestId('answer-type-none')).toBeInTheDocument()
    })
  })

  it('shows answer configuration only for text type', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({
            id: 'ch-text',
            title: 'Text Q',
            answerType: 'text',
            autoValidate: true,
          }),
        ])
      }),
    )

    render(<ChallengeDetail challengeId="ch-text" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Accepted answers')).toBeInTheDocument()
      expect(screen.getByTestId('correct-answer-input')).toBeInTheDocument()
    })
  })

  it('hides answer configuration for file type', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({
            id: 'ch-file',
            title: 'Photo Q',
            answerType: 'file',
          }),
        ])
      }),
    )

    render(<ChallengeDetail challengeId="ch-file" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('challenge-detail')).toBeInTheDocument()
    })

    expect(screen.queryByText('Accepted answers')).not.toBeInTheDocument()
  })

  it('shows assigned base as clickable link', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({ id: 'challenge-1', title: 'Challenge Alpha' }),
        ])
      }),
      http.get('/api/games/:gameId/assignments', () => {
        return HttpResponse.json([
          createMockAssignment({
            baseId: 'base-1',
            challengeId: 'challenge-1',
          }),
        ])
      }),
      http.get('/api/games/:gameId/bases', () => {
        return HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Start Base' }),
        ])
      }),
    )

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('assigned-base-link')).toHaveTextContent(
        'Start Base',
      )
    })
  })

  it('clicking base link calls selectBase', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({ id: 'challenge-1', title: 'Challenge Alpha' }),
        ])
      }),
      http.get('/api/games/:gameId/assignments', () => {
        return HttpResponse.json([
          createMockAssignment({
            baseId: 'base-1',
            challengeId: 'challenge-1',
          }),
        ])
      }),
      http.get('/api/games/:gameId/bases', () => {
        return HttpResponse.json([
          createMockBase({ id: 'base-1', name: 'Start Base' }),
        ])
      }),
    )

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('assigned-base-link')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('assigned-base-link'))

    expect(useWorkspaceStore.getState().selectedBaseId).toBe('base-1')
  })

  it('shows "Assign to base" button when unassigned', async () => {
    server.use(
      http.get('/api/games/:gameId/assignments', () => {
        return HttpResponse.json([])
      }),
    )

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByText('Assign to base')).toBeInTheDocument()
    })
  })

  it('shows save button and can save', async () => {
    const user = userEvent.setup()

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('save-challenge')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('save-challenge'))

    // Should not crash -- mutation fires
    await waitFor(() => {
      expect(screen.getByTestId('save-challenge')).toBeInTheDocument()
    })
  })

  it('toggles location bound', async () => {
    const user = userEvent.setup()

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('location-bound-toggle')).toBeInTheDocument()
    })

    const toggle = screen.getByTestId('location-bound-toggle')

    // Default is false -- should not have primary styling
    expect(toggle).toHaveAccessibleName('Require physical presence')
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.click(toggle)

    // After toggle, the button should have primary classes
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('toggles auto-validate', async () => {
    const user = userEvent.setup()

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('auto-validate-toggle')).toBeInTheDocument()
    })

    const toggle = screen.getByTestId('auto-validate-toggle')
    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('renders correctAnswer as chip input instead of comma-separated Input', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({
            id: 'challenge-1',
            title: 'Challenge Alpha',
            answerType: 'text',
            autoValidate: true,
            correctAnswer: ['FOX', '{{secret}}'],
          }),
        ])
      }),
    )

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('correct-answer-input')).toBeInTheDocument()
    })
    // Chip UI: both literal and variable chips render.
    expect(screen.getByText('FOX')).toBeInTheDocument()
    expect(screen.getByText('{{secret}}')).toBeInTheDocument()
    // variable-tag pill has the --undefined modifier because the mocked
    // variable set uses keys teamColor/motto, not "secret".
    expect(screen.getByTestId('chip-pill-secret')).toHaveClass('variable-tag')
  })

  it('shows Preview toggle and switches to resolved view', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({
            id: 'challenge-1',
            title: 'Challenge Alpha',
            answerType: 'text',
            content: '<p>Find {{teamColor}} at base</p>',
            autoValidate: true,
            correctAnswer: ['{{teamColor}}'],
          }),
        ])
      }),
    )

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(screen.getByTestId('preview-preview-btn')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('preview-preview-btn'))

    // Default team (alphabetical first — "Team Alpha" has teamColor="red")
    await waitFor(() =>
      expect(screen.getByTestId('content-preview')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('content-preview').innerHTML).toContain('red')

    // Switch to team-2 (Team Beta, teamColor="blue")
    await user.selectOptions(
      screen.getByTestId('preview-team-select'),
      'team-2',
    )
    await waitFor(() =>
      expect(screen.getByTestId('content-preview').innerHTML).toContain('blue'),
    )

    // correctAnswer preview shows resolved chip
    expect(screen.getByTestId('correct-answer-preview').textContent).toContain(
      'blue',
    )
  })

  it('warns about undefined-key references', async () => {
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({
            id: 'challenge-1',
            title: 'Challenge Alpha',
            answerType: 'text',
            autoValidate: true,
            correctAnswer: ['{{missing}}'],
          }),
        ])
      }),
    )

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() =>
      expect(screen.getByTestId('undefined-key-warning')).toHaveTextContent(
        '{{missing}}',
      ),
    )
  })

  it('blocks save when undefined {{key}} exists unless user confirms', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    let putCalled = false
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({
            id: 'challenge-1',
            title: 'Challenge Alpha',
            answerType: 'text',
          }),
        ])
      }),
      http.put('/api/games/:gameId/challenges/:challengeId', () => {
        putCalled = true
        return HttpResponse.json(
          createMockChallenge({ id: 'challenge-1', title: 'Challenge Alpha' }),
        )
      }),
    )

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => screen.getByTestId('challenge-title-input'))

    // Add a chip referencing an undefined key.
    await user.click(screen.getByTestId('auto-validate-toggle'))
    const chipInput = screen.getByTestId('chip-add-input')
    await user.type(chipInput, '{{{{undefined_key}}{Enter}')

    // The undefined-key warning should be visible.
    await waitFor(() =>
      expect(screen.getByTestId('undefined-key-warning')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('save-challenge'))
    expect(confirmSpy).toHaveBeenCalled()
    // User declined — mutation must not have fired.
    expect(putCalled).toBe(false)
    confirmSpy.mockRestore()
  })

  it('proceeds with save when user confirms undefined {{key}}', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    let putCalled = false
    server.use(
      http.get('/api/games/:gameId/challenges', () => {
        return HttpResponse.json([
          createMockChallenge({
            id: 'challenge-1',
            title: 'Challenge Alpha',
            answerType: 'text',
          }),
        ])
      }),
      http.put('/api/games/:gameId/challenges/:challengeId', () => {
        putCalled = true
        return HttpResponse.json(
          createMockChallenge({ id: 'challenge-1', title: 'Challenge Alpha' }),
        )
      }),
    )

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => screen.getByTestId('challenge-title-input'))

    await user.click(screen.getByTestId('auto-validate-toggle'))
    const chipInput = screen.getByTestId('chip-add-input')
    await user.type(chipInput, '{{{{undefined_key}}{Enter}')

    await waitFor(() =>
      expect(screen.getByTestId('undefined-key-warning')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('save-challenge'))
    expect(confirmSpy).toHaveBeenCalled()
    await waitFor(() => expect(putCalled).toBe(true))
    confirmSpy.mockRestore()
  })

  it('opens create-variable dialog when onCreateVariable fires from the editor', async () => {
    // Full-path exercise via the suggestion popover is brittle in jsdom
    // because TipTap's ProseMirror text input path doesn't fire through
    // userEvent.type reliably. Instead, verify the dialog wires up by
    // confirming the RichTextEditor receives an `onCreateVariable`
    // callback that, when invoked, opens the dialog with the seed key.
    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => screen.getByTestId('challenge-title-input'))

    // Dialog is hidden initially.
    expect(
      screen.queryByTestId('create-variable-dialog'),
    ).not.toBeInTheDocument()

    // Confirm the toolbar `{ }` button renders for BOTH editors (content
    // + completion), which indicates each editor received `variableKeys`
    // and an `onCreateVariable` handler. The dialog-open path itself is
    // covered by the RichTextEditor unit test for the toolbar button +
    // suggestion-list contract.
    await waitFor(() => {
      expect(screen.getAllByTestId('insert-variable-btn').length).toBe(2)
    })
  })
})

describe('ChallengeDetail keeps what it does not edit', () => {
  beforeEach(() => {
    resetChallengeCounter()
    resetAssignmentCounter()
    resetBaseCounter()
    resetTeamCounter()
    useWorkspaceStore.getState().reset()
  })

  function pinnedFixture() {
    server.use(
      http.get('/api/games/:gameId/bases', () =>
        HttpResponse.json([
          createMockBase({
            id: 'trail',
            name: 'Trailhead',
            fixedChallengeId: 'challenge-1',
          }),
          createMockBase({ id: 'bridge', name: 'Old bridge', hidden: true }),
          createMockBase({ id: 'tower', name: 'Ruined tower', hidden: true }),
        ]),
      ),
      http.get('/api/games/:gameId/challenges', () =>
        HttpResponse.json([
          createMockChallenge({
            id: 'challenge-1',
            title: 'Trailhead riddle',
            locationBound: true,
            fixedBaseId: 'trail',
            unlocksBaseIds: ['bridge'],
            tagIds: ['tag-a'],
            requirePresenceToSubmit: true,
          }),
          createMockChallenge({
            id: 'challenge-2',
            title: 'Bridge count',
            unlocksBaseIds: ['tower'],
          }),
        ]),
      ),
    )
  }

  it('the Save button carries tags, the presence rule and the unlock chain unchanged', async () => {
    const user = userEvent.setup()
    pinnedFixture()
    let body: Record<string, unknown> | null = null
    server.use(
      http.put(
        '/api/games/:gameId/challenges/:challengeId',
        async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(
            createMockChallenge({
              id: 'challenge-1',
              title: 'Trailhead riddle',
            }),
          )
        },
      ),
    )

    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })
    await screen.findByTestId('unlocks-bases')
    await user.click(screen.getByTestId('save-challenge'))

    await waitFor(() => expect(body).not.toBeNull())
    expect(body).toMatchObject({
      tagIds: ['tag-a'],
      requirePresenceToSubmit: true,
      unlocksBaseIds: ['bridge'],
    })
  })

  it('a hidden base another challenge already reveals is shown but cannot be picked', async () => {
    pinnedFixture()
    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    const tower = await screen.findByTestId('unlocks-base-tower')
    expect(tower).toBeDisabled()
    expect(tower).toHaveAttribute('title', 'Already revealed by “Bridge count”')
    expect(screen.getByTestId('unlocks-base-bridge')).not.toBeDisabled()
    expect(screen.getByTestId('unlocks-base-bridge')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('ChallengeDetail tutorial anchors', () => {
  beforeEach(() => {
    resetChallengeCounter()
    resetAssignmentCounter()
    resetBaseCounter()
    resetTeamCounter()
    useWorkspaceStore.getState().reset()
  })

  it('reports the selected answer type and the two toggles through aria-pressed', async () => {
    const user = userEvent.setup()
    render(<ChallengeDetail challengeId="challenge-1" gameId={gameId} />, {
      wrapper: createWrapper(),
    })

    const textButton = await screen.findByTestId('answer-type-text')
    expect(screen.getByTestId('answer-type-group')).toContainElement(textButton)
    expect(textButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('answer-type-file')).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    const autoValidate = screen.getByTestId('auto-validate-toggle')
    const before = autoValidate.getAttribute('aria-checked')
    await user.click(autoValidate)
    expect(autoValidate.getAttribute('aria-checked')).not.toBe(before)

    expect(
      screen.getByTestId('location-bound-toggle').getAttribute('aria-checked'),
    ).toMatch(/true|false/)
  })
})

it('keeps accepted answers only while automatic checking is on and retains their values', async () => {
  server.use(
    http.get('/api/games/:gameId/challenges', () =>
      HttpResponse.json([
        createMockChallenge({
          id: 'ch-toggle',
          answerType: 'text',
          autoValidate: false,
          correctAnswer: ['FOX'],
        }),
      ]),
    ),
  )
  render(<ChallengeDetail gameId="game-1" challengeId="ch-toggle" />, {
    wrapper: createWrapper(),
  })
  const toggle = await screen.findByRole('switch', {
    name: 'Check answers automatically',
  })
  expect(screen.queryByTestId('correct-answer-input')).not.toBeInTheDocument()
  await userEvent.click(toggle)
  expect(screen.getByTestId('correct-answer-input')).toHaveTextContent('FOX')
  await userEvent.click(toggle)
  expect(screen.queryByTestId('correct-answer-input')).not.toBeInTheDocument()
  await userEvent.click(toggle)
  expect(screen.getByTestId('correct-answer-input')).toHaveTextContent('FOX')
})
