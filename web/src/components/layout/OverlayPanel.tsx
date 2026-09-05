import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const overlayPanelVariants = cva(
  'border border-border bg-card/95 text-card-foreground shadow-overlay backdrop-blur-xl',
  {
    variants: {
      padding: {
        none: '',
        sm: 'p-3',
        md: 'p-4',
      },
      shape: {
        default: 'rounded-lg',
        sheet: 'rounded-t-xl rounded-b-none',
        pill: 'rounded-full',
      },
    },
    defaultVariants: {
      padding: 'md',
      shape: 'default',
    },
  },
)

export interface OverlayPanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof overlayPanelVariants> {
  as?: 'div' | 'section' | 'button'
}

export const OverlayPanel = React.forwardRef<HTMLDivElement, OverlayPanelProps>(
  ({ as = 'section', className, padding, shape, ...props }, ref) => {
    const Component = as as React.ElementType

    return (
      <Component
        ref={ref}
        className={cn(overlayPanelVariants({ padding, shape }), className)}
        {...props}
      />
    )
  },
)

OverlayPanel.displayName = 'OverlayPanel'
