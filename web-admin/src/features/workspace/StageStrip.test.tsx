import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StageStrip } from './StageStrip'
import type { Stage } from '@/types/v2'

function makeStage(overrides: Partial<Stage> & { id: string; name: string }): Stage {
  return {
    gameId: 'game-1',
    description: null,
    orderIndex: 0,
    transitionType: 'manual',
    scheduledAt: null,
    triggerBaseId: null,
    isActive: false,
    baseIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const twoStages: Stage[] = [
  makeStage({ id: 's1', name: 'Stage 1', orderIndex: 0, transitionType: 'manual' }),
  makeStage({ id: 's2', name: 'Stage 2', orderIndex: 1, transitionType: 'scheduled' }),
]

const threeStages: Stage[] = [
  makeStage({ id: 's1', name: 'Alpha', orderIndex: 0, transitionType: 'manual' }),
  makeStage({ id: 's2', name: 'Beta', orderIndex: 1, transitionType: 'trigger' }),
  makeStage({ id: 's3', name: 'Gamma', orderIndex: 2, transitionType: 'scheduled' }),
]

describe('StageStrip', () => {
  it('renders nothing when fewer than 2 stages', () => {
    const single = [makeStage({ id: 's1', name: 'Only', orderIndex: 0 })]
    const { container } = render(
      <StageStrip stages={single} selectedStageId={null} onSelectStage={() => {}} gameStatus="setup" />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when 0 stages', () => {
    const { container } = render(
      <StageStrip stages={[]} selectedStageId={null} onSelectStage={() => {}} gameStatus="setup" />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders "All" button and stage pills when 2+ stages', () => {
    render(
      <StageStrip stages={twoStages} selectedStageId={null} onSelectStage={() => {}} gameStatus="setup" />,
    )
    expect(screen.getByText('All')).toBeDefined()
    expect(screen.getByText('Stage 1')).toBeDefined()
    expect(screen.getByText('Stage 2')).toBeDefined()
  })

  it('clicking a stage pill calls onSelectStage with stage id', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <StageStrip stages={twoStages} selectedStageId={null} onSelectStage={onSelect} gameStatus="setup" />,
    )
    await user.click(screen.getByText('Stage 2'))
    expect(onSelect).toHaveBeenCalledWith('s2')
  })

  it('clicking "All" calls onSelectStage with null', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <StageStrip stages={twoStages} selectedStageId="s1" onSelectStage={onSelect} gameStatus="setup" />,
    )
    await user.click(screen.getByText('All'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('shows transition indicators between stages', () => {
    const { container } = render(
      <StageStrip stages={threeStages} selectedStageId={null} onSelectStage={() => {}} gameStatus="setup" />,
    )
    // Arrow characters rendered between stages
    const arrows = container.querySelectorAll('span')
    const arrowTexts = Array.from(arrows).map((el) => el.textContent)
    // Should contain right-arrow characters
    expect(arrowTexts.some((t) => t?.includes('\u2192'))).toBe(true)
  })

  it('shows scheduled transition icon', () => {
    const { container } = render(
      <StageStrip stages={threeStages} selectedStageId={null} onSelectStage={() => {}} gameStatus="setup" />,
    )
    // Scheduled icon: ⏱ (&#9201; = \u23F1)
    const spans = Array.from(container.querySelectorAll('span[title="Scheduled"]'))
    expect(spans.length).toBeGreaterThan(0)
  })

  it('shows trigger transition icon', () => {
    const { container } = render(
      <StageStrip stages={threeStages} selectedStageId={null} onSelectStage={() => {}} gameStatus="setup" />,
    )
    const spans = Array.from(container.querySelectorAll('span[title="Trigger"]'))
    expect(spans.length).toBeGreaterThan(0)
  })

  it('shows checkmark for completed stages when live', () => {
    const liveStages: Stage[] = [
      makeStage({ id: 's1', name: 'Done', orderIndex: 0, isActive: false }),
      makeStage({ id: 's2', name: 'Current', orderIndex: 1, isActive: true }),
      makeStage({ id: 's3', name: 'Locked', orderIndex: 2, isActive: false }),
    ]
    const { container } = render(
      <StageStrip stages={liveStages} selectedStageId={null} onSelectStage={() => {}} gameStatus="live" />,
    )
    // Checkmark: ✓ (\u2713)
    const texts = Array.from(container.querySelectorAll('span')).map((el) => el.textContent)
    expect(texts.some((t) => t?.includes('\u2713'))).toBe(true)
  })

  it('shows lock icon for locked stages when live', () => {
    const liveStages: Stage[] = [
      makeStage({ id: 's1', name: 'Done', orderIndex: 0, isActive: false }),
      makeStage({ id: 's2', name: 'Current', orderIndex: 1, isActive: true }),
      makeStage({ id: 's3', name: 'Locked', orderIndex: 2, isActive: false }),
    ]
    const { container } = render(
      <StageStrip stages={liveStages} selectedStageId={null} onSelectStage={() => {}} gameStatus="live" />,
    )
    // Lock: 🔒 (\uD83D\uDD12)
    const texts = Array.from(container.querySelectorAll('span')).map((el) => el.textContent)
    expect(texts.some((t) => t?.includes('\uD83D\uDD12'))).toBe(true)
  })

  it('renders "+ Stage" button', () => {
    render(
      <StageStrip stages={twoStages} selectedStageId={null} onSelectStage={() => {}} gameStatus="setup" />,
    )
    expect(screen.getByText('+ Stage')).toBeDefined()
  })
})
