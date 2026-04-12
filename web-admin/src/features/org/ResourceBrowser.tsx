import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Folder,
  File,
  FileText,
  Upload,
  Plus,
  Trash2,
  Search,
  Share2,
  FolderPlus,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RichTextEditor } from '@/components/editor/RichTextEditor'
import { useOrgResources, useGameResources, useOrgFolders, useGameFolders } from '@/hooks/queries/useResources'
import {
  useCreateOrgResource,
  useCreateGameResource,
  useUpdateResource,
  useDeleteResource,
  useCreateFolder,
  useDeleteFolder,
} from '@/hooks/mutations/useResourceMutations'
import type { Resource, ResourceFolder } from '@/types/resource'

interface ResourceBrowserProps {
  orgId?: string
  gameId?: string
  showShareToggle?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function fileTypeIcon(contentType: string, type: 'file' | 'document') {
  if (type === 'document') return <FileText className="h-4 w-4 text-blue-500" />
  if (contentType.startsWith('image/')) return <span className="text-sm">🖼️</span>
  if (contentType.startsWith('audio/')) return <span className="text-sm">🎵</span>
  if (contentType.startsWith('video/')) return <span className="text-sm">🎬</span>
  if (contentType.includes('pdf')) return <span className="text-sm">📄</span>
  return <File className="h-4 w-4 text-muted-foreground" />
}

export function ResourceBrowser({ orgId, gameId, showShareToggle }: ResourceBrowserProps) {
  const { t } = useTranslation()
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [docContent, setDocContent] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scope = { orgId, gameId }

  const { data: orgResources = [] } = useOrgResources(orgId, {
    folderId: currentFolderId ?? undefined,
    search: searchQuery || undefined,
  })
  const { data: gameResources = [] } = useGameResources(gameId, {
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

  const handleUpload = useCallback((file: File) => {
    const metadata = JSON.stringify({
      name: file.name,
      type: 'file',
      folderId: currentFolderId,
    })
    const formData = new FormData()
    formData.append('metadata', new Blob([metadata], { type: 'application/json' }))
    formData.append('file', file)

    if (orgId) {
      createOrgResource.mutate(formData)
    } else if (gameId) {
      createGameResource.mutate(formData)
    }
  }, [orgId, gameId, currentFolderId, createOrgResource, createGameResource])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  const handleNewDocument = useCallback(() => {
    const metadata = JSON.stringify({
      name: 'Untitled document',
      type: 'document',
      folderId: currentFolderId,
      content: '',
    })
    const formData = new FormData()
    formData.append('metadata', new Blob([metadata], { type: 'application/json' }))

    const mutation = orgId ? createOrgResource : createGameResource
    mutation.mutate(formData, {
      onSuccess: (resource) => {
        setEditingDocId(resource.id)
        setDocContent(resource.content ?? '')
      },
    })
  }, [orgId, currentFolderId, createOrgResource, createGameResource])

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

  const handleDelete = (id: string) => {
    if (confirm(t('resources.deleteConfirm', 'Are you sure you want to delete this resource?'))) {
      deleteResource.mutate(id)
    }
  }

  const handleDeleteFolder = (id: string) => {
    if (confirm(t('resources.deleteFolderConfirm', 'Are you sure you want to delete this folder?'))) {
      deleteFolder.mutate(id)
    }
  }

  const handleToggleShare = (resource: Resource) => {
    updateResource.mutate({ id: resource.id, data: { sharedWithPlayers: !resource.sharedWithPlayers } })
  }

  const handleSaveDoc = (resource: Resource) => {
    updateResource.mutate({ id: resource.id, data: { content: docContent } }, {
      onSuccess: () => setEditingDocId(null),
    })
  }

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder.mutate({ name: newFolderName.trim(), parentId: currentFolderId ?? undefined })
      setNewFolderName('')
      setNewFolderMode(false)
    }
  }

  const visibleFolders = currentFolderId
    ? folders.filter((f) => f.parentId === currentFolderId)
    : folders.filter((f) => f.parentId === null)

  const editingDoc = editingDocId ? resources.find((r) => r.id === editingDocId) : null

  return (
    <div className="flex h-full">
      {/* Left sidebar: folder tree */}
      <div className="w-48 shrink-0 border-r border-border bg-muted/30 flex flex-col">
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
            <button
              key={folder.id}
              onClick={() => setCurrentFolderId(folder.id)}
              className={cn(
                'w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer flex items-center gap-2 group',
                folder.parentId ? 'pl-5' : '',
                currentFolderId === folder.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">{folder.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id) }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition-all cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </button>
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
                placeholder="Folder name"
                className="flex-1 text-xs px-2 py-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleCreateFolder}
                className="p-1 rounded bg-primary text-primary-foreground cursor-pointer hover:opacity-90"
              >
                <Plus className="h-3 w-3" />
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b border-border">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('resources.search', 'Search resources...')}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex-1" />

          {/* New document */}
          <button
            onClick={handleNewDocument}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('resources.newDocument', 'New document')}
          </button>

          {/* Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            {t('resources.upload', 'Upload file')}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>

        {/* Resource list */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Sub-folders in current folder */}
          {visibleFolders.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/50 group cursor-pointer"
              onClick={() => setCurrentFolderId(folder.id)}
            >
              <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
              <span className="flex-1 text-sm font-medium">{folder.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id) }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {resources.length === 0 && visibleFolders.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
              <File className="h-8 w-8 opacity-40" />
              <span>{t('resources.noResources', 'No resources yet')}</span>
            </div>
          )}

          {resources.map((resource) => (
            <div key={resource.id} className="group">
              {editingDocId === resource.id && editingDoc ? (
                <div className="border border-border rounded-md mb-2 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                    <FileText className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium flex-1">{resource.name}</span>
                    <button
                      onClick={() => handleSaveDoc(resource)}
                      disabled={updateResource.isPending}
                      className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md cursor-pointer hover:opacity-90 disabled:opacity-50"
                    >
                      {t('common.save', 'Save')}
                    </button>
                    <button
                      onClick={() => setEditingDocId(null)}
                      className="p-1 rounded hover:bg-accent cursor-pointer text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <RichTextEditor
                    content={docContent}
                    onChange={setDocContent}
                    placeholder="Document content..."
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/50">
                  <div className="shrink-0">
                    {fileTypeIcon(resource.contentType, resource.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    {renamingId === resource.id ? (
                      <input
                        autoFocus
                        value={renameValue}
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
                        className={cn(
                          'text-sm text-left truncate w-full',
                          resource.type === 'document'
                            ? 'hover:text-primary cursor-pointer'
                            : 'cursor-default',
                        )}
                        onClick={() => {
                          if (resource.type === 'document') {
                            setEditingDocId(resource.id)
                            setDocContent(resource.content ?? '')
                          }
                        }}
                      >
                        {resource.name}
                      </button>
                    )}
                    <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                      <span>{formatBytes(resource.sizeBytes)}</span>
                      <span>·</span>
                      <span>{resource.createdByName}</span>
                      <span>·</span>
                      <span>{new Date(resource.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                    {showShareToggle && (
                      <button
                        onClick={() => handleToggleShare(resource)}
                        title={t('resources.sharedWithPlayers', 'Shared with players')}
                        className={cn(
                          'p-1 rounded transition-colors cursor-pointer',
                          resource.sharedWithPlayers
                            ? 'text-primary bg-primary/10'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                        )}
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleRenameStart(resource)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer text-xs"
                      title={t('resources.rename', 'Rename')}
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleDelete(resource.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                      title={t('common.delete', 'Delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
