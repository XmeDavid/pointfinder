import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useImportGame } from '@/hooks/mutations/useGameMutations'
import { isGameExportDto, type GameExportDto } from '@/lib/api/games'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export function ImportGameDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const importGame = useImportGame()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<GameExportDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setFile(null)
    setParsed(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setParsed(null)
    const f = e.target.files?.[0]
    if (!f) return

    if (!f.name.endsWith('.json')) {
      setError('Please select a JSON file')
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      setError('File size exceeds 5MB limit')
      return
    }

    setFile(f)
    try {
      const text = await f.text()
      const data = JSON.parse(text)
      if (!isGameExportDto(data)) {
        setError('Invalid game export file structure')
        return
      }
      setParsed(data)
    } catch {
      setError('Invalid JSON file')
    }
  }

  const handleImport = () => {
    if (!parsed) return
    importGame.mutate(
      { gameData: parsed },
      {
        onSuccess: (game) => {
          handleClose()
          navigate(`/game/${game.id}`)
        },
        onError: () => setError('Failed to import game. Please try again.'),
      },
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />
      <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Import Game</h2>
        <p className="text-sm text-muted-foreground">
          Upload a game export file to create a new game with all bases,
          challenges, and teams.
        </p>

        {/* File input */}
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleFile}
            data-testid="import-file-input"
            className="w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-muted file:text-foreground file:cursor-pointer hover:file:bg-muted/80"
          />
          {file && parsed && (
            <div className="px-3 py-2 rounded-lg bg-muted text-sm text-foreground">
              <span className="font-medium">{parsed.game.name}</span>
              <span className="text-muted-foreground ml-2">
                {parsed.bases.length} bases, {parsed.challenges.length}{' '}
                challenges
                {parsed.teams && parsed.teams.length > 0
                  ? `, ${parsed.teams.length} teams`
                  : ''}
                {parsed.tags && parsed.tags.length > 0
                  ? `, ${parsed.tags.length} tags`
                  : ''}
                {parsed.stages && parsed.stages.length > 0
                  ? `, ${parsed.stages.length} stages`
                  : ''}
              </span>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive" data-testid="import-error">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!parsed || importGame.isPending}
            data-testid="confirm-import-btn"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              parsed && !importGame.isPending
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            {importGame.isPending ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
