import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const surfacePanelVariants = cva(
  'rounded-lg border border-border bg-card text-card-foreground',
  {
    variants: {
      padding: {
        none: '',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
      },
      elevation: {
        none: '',
        panel: 'shadow-panel',
      },
    },
    defaultVariants: {
      padding: 'md',
      elevation: 'none',
    },
  },
)

export interface SurfacePanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof surfacePanelVariants> {}

export const SurfacePanel = React.forwardRef<HTMLDivElement, SurfacePanelProps>(
  ({ className, padding, elevation, ...props }, ref) => (
    <section
      ref={ref}
      className={cn(surfacePanelVariants({ padding, elevation }), className)}
      {...props}
    />
  ),
)

SurfacePanel.displayName = 'SurfacePanel'
