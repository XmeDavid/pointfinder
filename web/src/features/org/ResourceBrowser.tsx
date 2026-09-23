import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Folder,
  File,
  Upload,
  Plus,
  Trash2,
  Search,
  FolderPlus,
  Pencil,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select } from '@/components/ui/select'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { getApiErrorMessage } from '@/lib/api/errors'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { cn } from '@/lib/utils'
import { ResourceViewer } from './ResourceViewer'
import { ResourceTypeIcon } from './ResourceTypeIcon'
import {
  useOrgResources,
  useGameResources,
  useOrgFolders,
  useGameFolders,
} from '@/hooks/queries/useResources'
import {
  useCreateOrgResource,
  useCreateGameResource,
  useUpdateResource,
  useDeleteResource,
  useCreateFolder,
  useDeleteFolder,
} from '@/hooks/mutations/useResourceMutations'
import type { Resource, ResourceFolder } from '@/types/resource'
import { formatBytes } from '@/lib/utils/formatBytes'

interface ResourceBrowserProps {
  orgId?: string
  gameId?: string
  showShareToggle?: boolean
}

export function ResourceBrowser({
  orgId,
  gameId,
  showShareToggle,
}: ResourceBrowserProps) {
  const { t, i18n } = useTranslation()
  const online = useOnlineStatus()
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  // OW-08: a resource opens in the viewer to be read; a new document opens in its editor.
  const [viewing, setViewing] = useState<{ id: string; mode: 'read' | 'edit' } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'resource' | 'folder'; id: string; name: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scope = { orgId, gameId }

  const { data: orgResources = [], refetch: reloadOrg } = useOrgResources(orgId, {
    folderId: currentFolderId ?? undefined,
    search: searchQuery || undefined,
  })
  const {
    data: gameResources = [],
    isPending: gameLoading,
    isError: gameError,
    refetch: reloadGame,
  } = useGameResources(gameId, {
    folderId: currentFolderId ?? undefined,
    search: searchQuery || undefined,
  })
  const { data: orgFolders = [] } = useOrgFolders(orgId)
  const { data: gameFolders = [] } = useGameFolders(gameId)

  const resources: Resource[] = orgId ? orgResources : gameResources
  const folders: ResourceFolder[] = orgId ? orgFolders : gameFolders

  const createOrgResource = useCreateOrgResource(orgId ?? '')
  const createGameResource = useCreateGameResource(gameId ?? '')
  const updateResource = useUpdateResource(scope)
  const deleteResource = useDeleteResource(scope)
  const createFolder = useCreateFolder(scope)
  const deleteFolder = useDeleteFolder(scope)
  const busy =
    createOrgResource.isPending ||
    createGameResource.isPending ||
    updateResource.isPending ||
    deleteResource.isPending
  const error =
    createOrgResource.error ||
    createGameResource.error ||
    updateResource.error ||
    deleteResource.error ||
    createFolder.error ||
    deleteFolder.error

  const handleUpload = useCallback(
    (file: File) => {
      const metadata = JSON.stringify({
        name: file.name,
        type: 'file',
        folderId: currentFolderId,
      })
      const formData = new FormData()
      formData.append(
        'metadata',
        new Blob([metadata], { type: 'application/json' }),
      )
      formData.append('file', file)

      if (orgId) {
        createOrgResource.mutate(formData)
      } else if (gameId) {
        createGameResource.mutate(formData)
      }
    },
    [orgId, gameId, currentFolderId, createOrgResource, createGameResource],
  )

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  const handleNewDocument = useCallback(() => {
    setSearchQuery('')
    const metadata = JSON.stringify({
      name: t('resources.untitledDocument'),
      type: 'document',
      folderId: currentFolderId,
      content: '',
    })
    const formData = new FormData()
    formData.append(
      'metadata',
      new Blob([metadata], { type: 'application/json' }),
    )

    const mutation = orgId ? createOrgResource : createGameResource
    mutation.mutate(formData, {
      onSuccess: (resource) => setViewing({ id: resource.id, mode: 'edit' }),
    })
  }, [orgId, currentFolderId, createOrgResource, createGameResource, t])

  const handleRenameStart = (resource: Resource) => {
    setRenamingId(resource.id)
    setRenameValue(resource.name)
  }

  const handleRenameSubmit = (id: string) => {
    if (renameValue.trim()) {
      updateResource.mutate({ id, data: { name: renameValue.trim() } })
    }
    setRenamingId(null)
  }

  const handleConfirmDelete = () => {
    if (!confirmDelete) return
    if (confirmDelete.kind === 'folder') deleteFolder.mutate(confirmDelete.id)
    else {
      deleteResource.mutate(confirmDelete.id)
      if (viewing?.id === confirmDelete.id) setViewing(null)
    }
    setConfirmDelete(null)
  }

  const handleToggleShare = (resource: Resource) => {
    updateResource.mutate({
      id: resource.id,
      data: { sharedWithPlayers: !resource.sharedWithPlayers },
    })
  }

  const saveDocument = (id: string) => (fields: { name: string; content: string }) =>
    updateResource.mutateAsync({ id, data: { name: fields.name, content: fields.content } })

  // Presigned links expire; the list endpoint signs them afresh.
  const freshDownloadUrl = (id: string) => async () => {
    const result = orgId ? await reloadOrg() : await reloadGame()
    return result.data?.find((r) => r.id === id)?.downloadUrl ?? null
  }

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder.mutate({
        name: newFolderName.trim(),
        parentId: currentFolderId ?? undefined,
      })
      setNewFolderName('')
      setNewFolderMode(false)
    }
  }

  const visibleFolders = currentFolderId
    ? folders.filter((f) => f.parentId === currentFolderId)
    : folders.filter((f) => f.parentId === null)

  const viewedResource = viewing ? resources.find((r) => r.id === viewing.id) : undefined

  return (
    <div className="flex h-full min-w-0 w-full" data-testid="resource-browser">
      {/* Left sidebar: folder tree */}
      <div
        className={cn(
          'w-48 shrink-0 border-r border-border bg-muted/30 flex flex-col',
          gameId && 'hidden',
        )}
      >
        <div className="p-3 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('resources.folders', 'Folders')}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {/* All files */}
          <button
            onClick={() => setCurrentFolderId(null)}
            className={cn(
              'w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer flex items-center gap-2',
              currentFolderId === null
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            <File className="h-3.5 w-3.5 shrink-0" />
            {t('common.all', 'All')}
          </button>

          {/* Folder list */}
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={cn(
                'flex items-center gap-1 rounded-md group',
                folder.parentId ? 'pl-3' : '',
                currentFolderId === folder.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <button
                type="button"
                onClick={() => setCurrentFolderId(folder.id)}
                aria-pressed={currentFolderId === folder.id}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm cursor-pointer"
              >
                <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{folder.name}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete({ kind: 'folder', id: folder.id, name: folder.name })}
                aria-label={t('resources.deleteFolder', { name: folder.name })}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded hover:text-destructive transition-all cursor-pointer"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        {/* New folder */}
        <div className="p-2 border-t border-border">
          {newFolderMode ? (
            <div className="flex gap-1">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder()
                  if (e.key === 'Escape') setNewFolderMode(false)
                }}
                placeholder={t('resources.folderName')}
                aria-label={t('resources.folderName')}
                className="flex-1 text-xs px-2 py-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                aria-label={t('resources.newFolder')}
                className="p-1 rounded bg-primary text-primary-foreground cursor-pointer hover:opacity-90"
              >
                <Plus className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setNewFolderMode(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors cursor-pointer"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {t('resources.newFolder', 'New folder')}
            </button>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
        {gameId && (
          <div className="px-3 pt-3 text-sm text-muted-foreground">
            {t('resources.gameHelp')}
          </div>
        )}
        {!online && (
          <p role="status" className="p-3 text-sm">
            {t('resources.offline')}
          </p>
        )}
        {error && (
          <p role="alert" className="p-3 text-sm text-destructive">
            {getApiErrorMessage(error, t('common.unknownError'))}
          </p>
        )}
        {gameId && gameError && (
          <div role="alert" className="p-3">
            <p>{t('resources.loadError')}</p>
            <Button variant="outline" onClick={() => void reloadGame()}>
              {t('common.retry')}
            </Button>
          </div>
        )}
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
          {/* Search */}
          <div className={cn('relative flex-1', gameId && 'basis-full')}>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t('resources.search')}
              placeholder={t('resources.search', 'Search resources...')}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* New document */}
          <button
            disabled={busy || !online}
            data-testid="resource-new-document"
            onClick={handleNewDocument}
            className="min-h-11 disabled:opacity-50 flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('resources.newDocument', 'New document')}
          </button>

          {/* Upload */}
          <button
            disabled={busy || !online}
            onClick={() => fileInputRef.current?.click()}
            className="min-h-11 disabled:opacity-50 flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            {t('resources.upload', 'Upload file')}
          </button>

          <input
            ref={fileInputRef}
            data-testid="resource-upload-input"
            type="file"
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>

        {gameId && folders.length > 0 && (
          <div className="px-3 pb-2">
            <Select
              aria-label={t('resources.folders')}
              value={currentFolderId ?? ''}
              onChange={(e) => setCurrentFolderId(e.target.value || null)}
            >
              <option value="">{t('common.all')}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {gameId && gameLoading && (
          <p role="status" className="p-3 text-sm">
            {t('common.loading')}
          </p>
        )}
        {/* Resource list */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Sub-folders in current folder */}
          {visibleFolders.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center gap-3 rounded-md hover:bg-accent/50 group"
            >
              <button
                type="button"
                onClick={() => setCurrentFolderId(folder.id)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left cursor-pointer"
              >
                <Folder className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                <span className="flex-1 truncate text-sm font-medium">{folder.name}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete({ kind: 'folder', id: folder.id, name: folder.name })}
                aria-label={t('resources.deleteFolder', { name: folder.name })}
                className="min-h-11 min-w-11 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}

          {resources.length === 0 &&
            visibleFolders.length === 0 &&
            (!gameId || (!gameLoading && !gameError)) && (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                <File className="h-8 w-8 opacity-40" />
                <span>{t('resources.noResources', 'No resources yet')}</span>
              </div>
            )}

          {resources.map((resource) => (
            <div key={resource.id} className="group">
              <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/50">
                <ResourceTypeIcon resource={resource} />

                <div className="flex-1 min-w-0">
                  {renamingId === resource.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      aria-label={t('resources.rename')}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(resource.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(resource.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      className="text-sm px-1 py-0.5 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                  ) : (
                    <button
                      type="button"
                      className="block min-h-11 w-full truncate text-left text-sm hover:text-primary cursor-pointer"
                      onClick={() => setViewing({ id: resource.id, mode: 'read' })}
                      data-testid={`resource-open-${resource.id}`}
                    >
                      {resource.name}
                    </button>
                  )}
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                    <span>{formatBytes(resource.sizeBytes)}</span>
                    <span aria-hidden>·</span>
                    <span>{resource.createdByName}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {new Date(resource.createdAt).toLocaleDateString(
                        i18n.language,
                      )}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRenameStart(resource)}
                    className="flex min-h-11 min-w-11 items-center justify-center p-2 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                    aria-label={t('resources.renameItem', { name: resource.name })}
                    title={t('resources.rename')}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete({ kind: 'resource', id: resource.id, name: resource.name })}
                    className="flex min-h-11 min-w-11 items-center justify-center p-2 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    aria-label={t('resources.deleteItem', { name: resource.name })}
                    title={t('common.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
              {showShareToggle && (
                <div className="flex items-center justify-between gap-3 px-3 pb-3">
                  <label htmlFor={`share-${resource.id}`} className="text-sm">
                    {t('resources.shareWithPlayers')}
                  </label>
                  <Switch
                    id={`share-${resource.id}`}
                    checked={resource.sharedWithPlayers}
                    disabled={busy || !online}
                    onCheckedChange={() => handleToggleShare(resource)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {viewing && viewedResource && (
        <ResourceViewer
          key={viewedResource.id}
          resource={viewedResource}
          scope={scope}
          initialMode={viewing.mode}
          online={online}
          showShareToggle={showShareToggle}
          sharing={updateResource.isPending}
          onToggleShare={() => handleToggleShare(viewedResource)}
          onSave={saveDocument(viewedResource.id)}
          freshDownloadUrl={freshDownloadUrl(viewedResource.id)}
          onClose={() => setViewing(null)}
        />
      )}
      <ConfirmDeleteDialog
        open={confirmDelete !== null}
        title={t(confirmDelete?.kind === 'folder' ? 'resources.deleteFolderTitle' : 'resources.deleteTitle', { name: confirmDelete?.name ?? '' })}
        description={t(confirmDelete?.kind === 'folder' ? 'resources.deleteFolderConfirm' : 'resources.deleteConfirm')}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
