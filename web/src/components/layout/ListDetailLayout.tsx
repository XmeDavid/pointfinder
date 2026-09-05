import type { HTMLAttributes, ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Phones show one pane at a time; wider drawers retain the list/detail split. */
export function ListDetailLayout({ list, selected, onBack, children, className, ...props }: HTMLAttributes<HTMLDivElement> & {
  list: ReactNode; selected: boolean; onBack: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex flex-1 min-w-0 min-h-0', className)} {...props}>
      <div className={cn('min-w-0 w-full md:w-56 md:border-r border-border flex-col shrink-0', selected ? 'hidden md:flex' : 'flex')}>
        {list}
      </div>
      <div className={cn('min-w-0 min-h-0 flex-1 flex-col', selected ? 'flex' : 'hidden md:flex')}>
        <div className="shrink-0 border-b border-border p-2 md:hidden">
          <Button variant="ghost" onClick={onBack} data-testid="detail-back">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />{t('common.back')}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
