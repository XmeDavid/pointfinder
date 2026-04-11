import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BaseMarkers } from './BaseMarkers'
import type { Base } from '@/types/base'

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
  Marker: ({ children, onClick }: { children: React.ReactNode; onClick?: (e: { originalEvent: { stopPropagation: () => void } }) => void }) => (
    <div data-testid="marker" onClick={() => onClick?.({ originalEvent: { stopPropagation: vi.fn() } })}>
      {children}
    </div>
  ),
  NavigationControl: () => null,
}))

function makeBase(overrides: Partial<Base> = {}): Base {
  return {
    id: 'base-1',
    gameId: 'game-1',
    name: 'Test Base',
    description: '',
    lat: 38.7,
    lng: -9.1,
    nfcLinked: true,
    hidden: false,
    ...overrides,
  }
}

describe('BaseMarkers', () => {
  it('renders a marker for each base', () => {
    const bases = [
      makeBase({ id: 'b1' }),
      makeBase({ id: 'b2', lat: 38.71, lng: -9.11 }),
      makeBase({ id: 'b3', lat: 38.72, lng: -9.12 }),
    ]

    render(
      <BaseMarkers
        bases={bases}
        mode="build"
        selectedBaseId={null}
        selectedStageId={null}
      />,
    )

    expect(screen.getByTestId('base-marker-b1')).toBeInTheDocument()
    expect(screen.getByTestId('base-marker-b2')).toBeInTheDocument()
    expect(screen.getByTestId('base-marker-b3')).toBeInTheDocument()
  })

  it('applies green styling for complete bases in build mode', () => {
    const base = makeBase({ nfcLinked: true, hidden: false })

    render(
      <BaseMarkers
        bases={[base]}
        mode="build"
        selectedBaseId={null}
        selectedStageId={null}
      />,
    )

    const marker = screen.getByTestId('base-marker-base-1')
    expect(marker.dataset.nfc).toBe('linked')
    expect(marker.dataset.hidden).toBeUndefined()
  })

  it('marks missing NFC bases in build mode', () => {
    const base = makeBase({ nfcLinked: false })

    render(
      <BaseMarkers
        bases={[base]}
        mode="build"
        selectedBaseId={null}
        selectedStageId={null}
      />,
    )

    const marker = screen.getByTestId('base-marker-base-1')
    expect(marker.dataset.nfc).toBe('missing')
  })

  it('marks hidden bases in build mode', () => {
    const base = makeBase({ hidden: true })

    render(
      <BaseMarkers
        bases={[base]}
        mode="build"
        selectedBaseId={null}
        selectedStageId={null}
      />,
    )

    const marker = screen.getByTestId('base-marker-base-1')
    expect(marker.dataset.hidden).toBe('true')
  })

  it('applies command mode styling', () => {
    const base = makeBase()

    render(
      <BaseMarkers
        bases={[base]}
        mode="command"
        selectedBaseId={null}
        selectedStageId={null}
      />,
    )

    const marker = screen.getByTestId('base-marker-base-1')
    expect(marker.dataset.mode).toBe('command')
  })

  it('marks selected base', () => {
    const base = makeBase()

    render(
      <BaseMarkers
        bases={[base]}
        mode="build"
        selectedBaseId="base-1"
        selectedStageId={null}
      />,
    )

    const marker = screen.getByTestId('base-marker-base-1')
    expect(marker.dataset.selected).toBe('true')
  })

  it('calls onBaseClick when clicked', () => {
    const handler = vi.fn()
    const base = makeBase()

    render(
      <BaseMarkers
        bases={[base]}
        mode="build"
        selectedBaseId={null}
        selectedStageId={null}
        onBaseClick={handler}
      />,
    )

    fireEvent.click(screen.getByTestId('marker'))
    expect(handler).toHaveBeenCalledWith('base-1')
  })

  it('dims bases not in selected stage', () => {
    const bases = [
      makeBase({ id: 'in-stage', stageId: 'stage-1' }),
      makeBase({ id: 'out-stage', stageId: 'stage-2', lat: 38.71, lng: -9.11 }),
      makeBase({ id: 'no-stage', stageId: null, lat: 38.72, lng: -9.12 }),
    ]

    render(
      <BaseMarkers
        bases={bases}
        mode="build"
        selectedBaseId={null}
        selectedStageId="stage-1"
      />,
    )

    expect(screen.getByTestId('base-marker-in-stage').dataset.dimmed).toBeUndefined()
    expect(screen.getByTestId('base-marker-out-stage').dataset.dimmed).toBe('true')
    expect(screen.getByTestId('base-marker-no-stage').dataset.dimmed).toBe('true')
  })

  it('shows base name as tooltip in build mode', () => {
    const base = makeBase({ name: 'Castle Tower' })

    render(
      <BaseMarkers
        bases={[base]}
        mode="build"
        selectedBaseId={null}
        selectedStageId={null}
      />,
    )

    expect(screen.getByTestId('base-marker-base-1').getAttribute('title')).toBe('Castle Tower')
  })

  it('does not show tooltip in command mode', () => {
    const base = makeBase({ name: 'Castle Tower' })

    render(
      <BaseMarkers
        bases={[base]}
        mode="command"
        selectedBaseId={null}
        selectedStageId={null}
      />,
    )

    expect(screen.getByTestId('base-marker-base-1').getAttribute('title')).toBeNull()
  })
})
