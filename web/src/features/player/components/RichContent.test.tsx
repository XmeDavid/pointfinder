import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { RichContent } from './RichContent'

it('keeps challenge formatting while removing executable markup', () => {
  const { container } = render(<RichContent html={'<strong>Clue</strong><img src="x" onerror=alert(1)><svg onload=alert(1)></svg><a href="javascript:alert(1)">link</a><script>alert(1)</script>'} />)
  expect(container.querySelector('strong')?.textContent).toBe('Clue')
  expect(container.querySelector('script, svg, [onerror], [onload], [href^="javascript:"]')).toBeNull()
})

it('opens enriched resource files without navigating the native webview', async () => {
  vi.spyOn(await import('@/platform/runtime'), 'isNative').mockReturnValue(true)
  const open = vi.spyOn(await import('@/platform/navigation'), 'openExternal').mockResolvedValue()
  render(<RichContent html='<div data-type="file-embed" data-resource-name="Trail map.pdf" data-resource-url="https://files.example.test/map.pdf?signature=123">Trail map.pdf</div>' />)
  const link = screen.getByRole('link', { name: 'Trail map.pdf' })
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await userEvent.click(link)
  expect(open).toHaveBeenCalledWith('https://files.example.test/map.pdf?signature=123')
})

it('does not turn executable resource URLs into links', () => {
  const { container } = render(<RichContent html='<div data-type="file-embed" data-resource-name="Bad" data-resource-url="javascript:alert(1)">Bad</div>' />)
  expect(container.querySelector('a')).toBeNull()
  expect(container).toHaveTextContent('Bad')
})
