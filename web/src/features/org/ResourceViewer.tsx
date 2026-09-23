import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, FileText, Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SaveStatusIndicator } from '@/components/status'
import { RichTextEditor } from '@/components/editor/RichTextEditor'
import { RichContent } from '@/features/player/components/RichContent'
import { draftKey } from '@/features/build/drafts/draftStore'
import { useEntityDraft } from '@/features/build/drafts/useEntityDraft'
import { useAuthStore } from '@/lib/auth/store'
import { getApiErrorMessage } from '@/lib/api/errors'
import { formatBytes } from '@/lib/utils/formatBytes'
import { isNative } from '@/platform'
import { openExternal } from '@/platform/navigation'
import { useToastStore } from '@/hooks/useToast'
import type { Resource } from '@/types/resource'
import { ResourceTypeIcon } from './ResourceTypeIcon'

interface DocumentFields {
  name: string
  content: string
}

export interface ResourceViewerProps {
  resource: Resource
  /** Where drafts are scoped: the game, or the organization for its library. */
  scope: { orgId?: string; gameId?: string }
  /** A new document opens straight into editing. */
  initialMode?: 'read' | 'edit'
  online: boolean
  showShareToggle?: boolean
  sharing: boolean
  onToggleShare: () => void
  onSave: (fields: DocumentFields) => Promise<Resource>
  /** A presigned link expires; the list refetch returns a fresh one. */
  freshDownloadUrl: () => Promise<string | null>
  onClose: () => void
}

/**
 * OW-08: a document or file opens to be read first, full screen on a phone
 * and as a large dialog on wider screens, with an explicit Edit action.
 * Editing uses the same surface and returns to reading once saved. Edits live
 * in a local draft scoped to the account and game (OW-04), so closing the
 * viewer, navigating away or a failed save keeps them for the next opening.
 */
export function ResourceViewer({
  resource,
  scope,
  initialMode = 'read',
  online,
  showShareToggle,
  sharing,
  onToggleShare,
  onSave,
  freshDownloadUrl,
  onClose,
}: ResourceViewerProps) {
  const { t, i18n } = useTranslation()
  const addToast = useToastStore((s) => s.addToast)
  const isDocument = resource.type === 'document'
  const accountId = useAuthStore((s) => s.user?.id)
  const draftScope = scope.gameId ?? (scope.orgId ? `org:${scope.orgId}` : 'library')
  const server = useMemo<DocumentFields | undefined>(
    () => (isDocument ? { name: resource.name, content: resource.content ?? '' } : undefined),
    [isDocument, resource.name, resource.content],
  )
  const save = useCallback(async (fields: DocumentFields) => {
    const saved = await onSave({ name: fields.name.trim() || resource.name, content: fields.content })
    return { name: saved.name, content: saved.content ?? '' }
  }, [onSave, resource.name])
  const describeError = useCallback((error: unknown) => getApiErrorMessage(error, t('common.unknownError')), [t])
  const draft = useEntityDraft<DocumentFields>({
    key: isDocument ? draftKey(accountId, draftScope, 'document', resource.id) : null,
    server,
    validate: (fields) => fields.name.trim().length > 0,
    save,
    autosave: false,
    describeError,
  })
  // A recovered draft means unfinished editing: reopen straight into it.
  const [mode, setMode] = useState<'read' | 'edit'>(initialMode)
  const editing = isDocument && (mode === 'edit' || draft.isDirty)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [opening, setOpening] = useState(false)
  const fields = draft.fields ?? server

  async function saveAndRead() {
    if (!online) return
    if (await draft.saveNow({ force: true })) setMode('read')
  }

  function stopEditing() {
    if (draft.isDirty) setConfirmDiscard(true)
    else setMode('read')
  }

  async function openFile() {
    // The tab opens before the await so the popup blocker still sees the tap.
    const tab = isNative() ? null : window.open('', '_blank', 'noopener,noreferrer')
    setOpening(true)
    try {
      const url = (await freshDownloadUrl()) ?? resource.downloadUrl
      if (!url) throw new Error('No download URL')
      if (isNative()) await openExternal(url)
      else if (tab) tab.location.href = url
      else throw new Error('Popup blocked')
    } catch {
      tab?.close()
      addToast(t('resources.openFailed'), 'error')
    } finally {
      setOpening(false)
    }
  }

  const isImage = resource.contentType.startsWith('image/') && !!resource.downloadUrl
  const meta = [
    formatBytes(resource.sizeBytes),
    resource.createdByName,
    new Date(resource.updatedAt ?? resource.createdAt).toLocaleDateString(i18n.language),
  ].filter(Boolean).join(' · ')

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        onClose={onClose}
        className="flex h-full max-h-full w-full max-w-none flex-col overflow-hidden rounded-none border-0 p-0 md:h-[85vh] md:max-w-3xl md:rounded-lg md:border"
        data-testid="resource-viewer"
      >
        <header className="flex items-start gap-3 border-b border-border py-3 pl-4 pr-14">
          <span className="mt-1 shrink-0">
            <ResourceTypeIcon resource={resource} />
          </span>
          <div className="min-w-0 flex-1">
            {editing && fields ? (
              <>
                <DialogTitle className="sr-only">{fields.name || resource.name}</DialogTitle>
                <Input
                  aria-label={t('resources.documentTitle')}
                  value={fields.name}
                  onChange={(e) => draft.update({ name: e.target.value })}
                  className="min-h-11 text-base font-semibold"
                  data-testid="resource-viewer-title-input"
                />
              </>
            ) : (
              <DialogTitle className="break-words text-lg leading-snug">{resource.name}</DialogTitle>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="resource-viewer-body">
          {isDocument && editing && fields ? (
            <div className="p-4">
              <RichTextEditor
                key={`doc-${resource.id}-${draft.generation}`}
                content={fields.content}
                onChange={(content) => draft.update({ content })}
                placeholder={t('resources.documentContent')}
              />
            </div>
          ) : isDocument ? (
            resource.content?.trim() ? (
              <RichContent html={resource.content} className="prose prose-sm max-w-none p-4 text-foreground dark:prose-invert md:prose-base" />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground" data-testid="resource-viewer-empty">
                <FileText className="h-8 w-8 opacity-40" aria-hidden />
                {t('resources.emptyDocument')}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-4 p-6 text-center">
              {isImage ? (
                <img src={resource.downloadUrl!} alt={resource.name} className="max-h-[50vh] max-w-full rounded-md border border-border object-contain" />
              ) : (
                <ResourceTypeIcon resource={resource} className="h-12 w-12" />
              )}
              <p className="text-sm text-muted-foreground">{resource.contentType}</p>
              <Button onClick={() => void openFile()} disabled={opening || !online} loading={opening} className="min-h-11" data-testid="resource-viewer-open-file">
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t('resources.openFile')}
              </Button>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          {editing && confirmDiscard ? (
            <div className="flex w-full flex-wrap items-center gap-2" role="group" aria-labelledby="resource-discard-question" data-testid="resource-viewer-discard">
              <p id="resource-discard-question" className="mr-auto text-sm">{t('resources.discardQuestion')}</p>
              <Button variant="outline" className="min-h-11" onClick={() => setConfirmDiscard(false)}>
                {t('resources.keepEditing')}
              </Button>
              <Button
                variant="destructive"
                className="min-h-11"
                onClick={() => {
                  setConfirmDiscard(false)
                  draft.discard()
                  setMode('read')
                }}
                data-testid="resource-viewer-discard-confirm"
              >
                {t('status.save.discard')}
              </Button>
            </div>
          ) : editing ? (
            <>
              <SaveStatusIndicator
                state={draft.status.state}
                error={draft.status.error}
                onRetry={() => void saveAndRead()}
                onKeepMine={draft.keepMine}
                onUseLatest={draft.discard}
                data-testid="resource-viewer-save-status"
                className="mr-auto"
              />
              <Button variant="outline" className="min-h-11" onClick={stopEditing} data-testid="resource-viewer-cancel">
                {t('common.cancel')}
              </Button>
              <Button
                className="min-h-11"
                onClick={() => void saveAndRead()}
                disabled={!online || draft.conflict || !fields?.name.trim()}
                loading={draft.status.state === 'saving'}
                data-testid="resource-viewer-save"
              >
                {t('common.save')}
              </Button>
            </>
          ) : (
            <>
              {showShareToggle && (
                <div className="mr-auto flex min-h-11 items-center gap-3">
                  <Switch
                    id={`viewer-share-${resource.id}`}
                    checked={resource.sharedWithPlayers}
                    disabled={sharing || !online}
                    onCheckedChange={onToggleShare}
                  />
                  <label htmlFor={`viewer-share-${resource.id}`} className="text-sm">
                    {t('resources.shareWithPlayers')}
                  </label>
                </div>
              )}
              {isDocument && (
                <Button className="min-h-11" onClick={() => setMode('edit')} disabled={!online} data-testid="resource-viewer-edit">
                  <Pencil className="h-4 w-4" aria-hidden />
                  {t('common.edit')}
                </Button>
              )}
              <Button variant="outline" className="min-h-11" onClick={onClose}>
                {t('common.close')}
              </Button>
            </>
          )}
          {!online && <p role="status" className="basis-full text-xs text-muted-foreground">{t('resources.offline')}</p>}
        </footer>
      </DialogContent>
    </Dialog>
  )
}
