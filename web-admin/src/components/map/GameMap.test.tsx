import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { GameMap } from './GameMap'

// MapLibre GL uses WebGL which isn't available in jsdom
vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children, className }: any) => (
    <div data-testid="map-container" className={className}>{children}</div>
  ),
  NavigationControl: () => <div data-testid="nav-control" />,
}))

describe('GameMap', () => {
  it('renders a map container', () => {
    const { getByTestId } = render(<GameMap />)
    expect(getByTestId('map-container')).toBeInTheDocument()
  })

  it('renders navigation control', () => {
    const { getByTestId } = render(<GameMap />)
    expect(getByTestId('nav-control')).toBeInTheDocument()
  })

  it('renders children inside the map', () => {
    const { getByText } = render(
      <GameMap>
        <div>Test Child</div>
      </GameMap>
    )
    expect(getByText('Test Child')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { getByTestId } = render(<GameMap className="custom-class" />)
    expect(getByTestId('map-wrapper').className).toContain('custom-class')
  })
})
