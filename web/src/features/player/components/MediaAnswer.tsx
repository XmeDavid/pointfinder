import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Image as ImageIcon, X } from 'lucide-react'
import { Alert, Button, Label, Textarea } from '@/components'
import { pickMedia } from '@/platform/media'

export const MAX_MEDIA = 5

export interface MediaAnswerProps {
  busy: boolean
  onSubmit: (files: File[], note: string) => void
}

/** Camera, library, up to five items, an optional note. Mirrors the old SolveView. */
export function MediaAnswer({ busy, onSubmit }: MediaAnswerProps) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const [files, setFiles] = useState<File[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const previews = useMemo(() => files.map((f) => ({ file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null })), [files])
  useEffect(() => () => previews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previews])

  async function pick(source: 'camera' | 'library') {
    setError(null)
    try {
      const picked = await pickMedia({ source, kind: 'image', multiple: source === 'library' })
      if (picked.length === 0) return
      setFiles((current) => [...current, ...picked].slice(0, MAX_MEDIA))
    } catch (err) {
      const code = (err as { code?: string }).code
      setError(code === 'denied' ? t('join.cameraDisabled') : code === 'busy' ? t('solve.processingMedia') : t('common.unknownError'))
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="player-media-answer">
      <p className="text-sm text-muted-foreground">{t('solve.photoInstructions')}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="lg" disabled={busy || files.length >= MAX_MEDIA} onClick={() => void pick('camera')} data-testid="player-media-camera-btn">
          <Camera className="mr-2 h-5 w-5" aria-hidden /> {t('solve.camera')}
        </Button>
        <Button type="button" variant="outline" size="lg" disabled={busy || files.length >= MAX_MEDIA} onClick={() => void pick('library')} data-testid="player-media-library-btn">
          <ImageIcon className="mr-2 h-5 w-5" aria-hidden /> {t('solve.library')}
        </Button>
      </div>
      {error && <Alert variant="warning" role="alert">{error}</Alert>}
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2" aria-label={t('solve.photo')}>
          {previews.map(({ file, url }, i) => (
            <li key={`${file.name}-${i}`} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
              {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center px-1 text-center text-xs text-muted-foreground">{file.name}</span>}
              <button type="button" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-background/90 text-foreground shadow" aria-label={`${t('solve.remove')} ${file.name}`} onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t('solve.mediaSelected', { count: files.length, max: MAX_MEDIA })}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="media-note">{t('solve.notesOptional')}</Label>
        <Textarea id="media-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('solve.addNote')} />
      </div>
      <Button size="lg" type="button" disabled={busy || files.length === 0} onClick={() => onSubmit(files, note.trim())} data-testid="player-media-submit-btn">{t('solve.submitPhotoBtn')}</Button>
      <p className="text-xs text-muted-foreground">{t('solve.photoHelp')}</p>
    </div>
  )
}
