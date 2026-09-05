import { useEffect, useRef } from 'react'
import { MapPinPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface MapActionMenuProps {
  position: { x: number; y: number }
  onPlaceBase: () => void
  onClose: () => void
}

export function MapActionMenu({ position, onPlaceBase, onClose }: MapActionMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstItemRef.current?.focus()

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('build.mapActions')}
      data-testid="map-action-menu"
      className="absolute z-30 min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style={{
        left: `max(0.5rem, min(${position.x}px, calc(100% - 12rem)))`,
        top: `max(0.5rem, min(${position.y}px, calc(100% - 3.5rem)))`,
      }}
    >
      <button
        ref={firstItemRef}
        type="button"
        role="menuitem"
        data-testid="place-base-here"
        onClick={onPlaceBase}
        className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
      >
        <MapPinPlus className="h-4 w-4" aria-hidden="true" />
        {t('build.placeBaseHere')}
      </button>
    </div>
  )
}
