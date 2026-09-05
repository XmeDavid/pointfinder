import * as React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { OverlayPanel } from './OverlayPanel'
import type { OverlayPanelProps } from './OverlayPanel'
import { SurfacePanel } from './SurfacePanel'

export interface InspectorPanelProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  footer?: React.ReactNode
  onClose?: () => void
  closeButtonTestId?: string
  shape?: OverlayPanelProps['shape']
  variant?: 'surface' | 'overlay'
}

export const InspectorPanel = React.forwardRef<
  HTMLDivElement,
  InspectorPanelProps
>(
  (
    {
      title,
      subtitle,
      actions,
      footer,
      onClose,
      closeButtonTestId,
      shape,
      variant = 'overlay',
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const Panel = variant === 'surface' ? SurfacePanel : OverlayPanel

    return (
      <Panel
        ref={ref}
        padding="none"
        {...(variant === 'overlay' ? { shape } : {})}
        className={cn('flex min-h-0 flex-col overflow-hidden', className)}
        {...props}
      >
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {title}
            </h2>
            {subtitle && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {subtitle}
              </div>
            )}
          </div>
          {actions}
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onClose}
              aria-label="Close inspector"
              data-testid={closeButtonTestId}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">{children}</div>
        {footer && <div className="border-t border-border px-4 py-3">{footer}</div>}
      </Panel>
    )
  },
)

InspectorPanel.displayName = 'InspectorPanel'
