import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { File, FileText, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGameResources } from '@/hooks/queries/useResources'
import { useOrgResources } from '@/hooks/queries/useResources'
import type { Resource } from '@/types/resource'

interface ResourcePickerProps {
  gameId: string
  orgId?: string
  onSelect: (resource: { id: string; name: string; sizeBytes: number; contentType: string }) => void
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function fileTypeIcon(contentType: string, type: 'file' | 'document') {
  if (type === 'document') return <FileText className="h-4 w-4 text-blue-500 shrink-0" />
  if (contentType.startsWith('image/')) return <span className="text-sm shrink-0">🖼️</span>
  if (contentType.startsWith('audio/')) return <span className="text-sm shrink-0">🎵</span>
  if (contentType.startsWith('video/')) return <span className="text-sm shrink-0">🎬</span>
  if (contentType.includes('pdf')) return <span className="text-sm shrink-0">📄</span>
  return <File className="h-4 w-4 text-muted-foreground shrink-0" />
}

type Tab = 'game' | 'org'

function ResourceList({
  resources,
  search,
  onSelect,
}: {
  resources: Resource[]
  search: string
  onSelect: (r: Resource) => void
}) {
  const { t } = useTranslation()
  const filtered = search
    ? resources.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : resources

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-2">
        <File className="h-6 w-6 opacity-40" />
        <span>{t('resources.noResources', 'No resources yet')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {filtered.map((resource) => (
        <button
          key={resource.id}
          onClick={() => onSelect(resource)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors cursor-pointer text-left"
        >
          {fileTypeIcon(resource.contentType, resource.type)}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{resource.name}</div>
            <div className="text-xs text-muted-foreground">{formatBytes(resource.sizeBytes)}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

export function ResourcePicker({ gameId, orgId, onSelect, onClose }: ResourcePickerProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<Tab>('game')
  const [search, setSearch] = useState('')

  const { data: gameResources = [] } = useGameResources(gameId)
  const { data: orgResources = [] } = useOrgResources(orgId)

  const hasTabs = !!orgId

  const handleSelect = (resource: Resource) => {
    onSelect({
      id: resource.id,
      name: resource.name,
      sizeBytes: resource.sizeBytes,
      contentType: resource.contentType,
    })
    onClose()
  }

  const currentResources = hasTabs && activeTab === 'org' ? orgResources : gameResources

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="font-semibold text-foreground">
            {t('resources.pickResource', 'Select a resource')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs (only when orgId provided) */}
        {hasTabs && (
          <div className="flex border-b border-border shrink-0">
            {([['game', t('resources.gameResources', 'Game resources')], ['org', t('resources.orgResources', 'Organization resources')]] as [Tab, string][]).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-1 px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
                  activeTab === tab
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="px-3 py-2 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('resources.search', 'Search resources...')}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Resource list */}
        <div className="overflow-y-auto flex-1 p-2">
          <ResourceList
            resources={currentResources}
            search={search}
            onSelect={handleSelect}
          />
        </div>
      </div>
    </div>
  )
}
