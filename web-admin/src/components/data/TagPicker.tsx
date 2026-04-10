import { useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { useTags } from '@/hooks/queries/useTags'
import { useCreateTag } from '@/hooks/mutations/useTagMutations'
import { COLOR_PALETTE, pickNextDefaultColor } from '@/lib/colorPalette'
import type { Tag } from '@/types'

interface TagPickerProps {
  gameId: string
  selectedTagIds: string[]
  onChange: (tagIds: string[]) => void
}

export function TagPicker({ gameId, selectedTagIds, onChange }: TagPickerProps) {
  const { data: tags = [] } = useTags(gameId)
  const createTag = useCreateTag(gameId)

  const [showCreate, setShowCreate] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(() =>
    pickNextDefaultColor(tags.map((t) => t.color)),
  )

  const selectedSet = new Set(selectedTagIds)

  const toggleTag = (tagId: string) => {
    if (selectedSet.has(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onChange([...selectedTagIds, tagId])
    }
  }

  const handleCreate = () => {
    const label = newLabel.trim()
    if (!label) return
    createTag.mutate(
      { label, color: newColor },
      {
        onSuccess: (created: Tag) => {
          setNewLabel('')
          setShowCreate(false)
          setNewColor(pickNextDefaultColor([...tags.map((t) => t.color), created.color]))
          // Auto-select the newly created tag
          onChange([...selectedTagIds, created.id])
        },
      },
    )
  }

  return (
    <div className="space-y-2" data-testid="tag-picker">
      {/* Existing tags as toggleable pills */}
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const selected = selectedSet.has(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              data-testid={`tag-toggle-${tag.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all cursor-pointer border"
              style={{
                backgroundColor: selected ? `${tag.color}25` : 'transparent',
                color: tag.color,
                borderColor: selected ? `${tag.color}60` : `${tag.color}30`,
              }}
            >
              {selected && <Check className="h-3 w-3" />}
              {tag.label}
            </button>
          )
        })}
      </div>

      {/* Create new tag */}
      {showCreate ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <span
              className="h-4 w-4 rounded-full shrink-0 border border-border/50"
              style={{ backgroundColor: newColor }}
            />
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Tag name..."
              maxLength={40}
              autoFocus
              data-testid="tag-create-input"
              className="flex-1 h-7 px-2 text-sm rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCreate()
                }
                if (e.key === 'Escape') {
                  setShowCreate(false)
                  setNewLabel('')
                }
              }}
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newLabel.trim() || createTag.isPending}
              data-testid="tag-create-confirm"
              className="px-2 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {createTag.isPending ? '...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setNewLabel('')
              }}
              className="px-2 py-1 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
          {/* Color swatches */}
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PALETTE.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                onClick={() => setNewColor(swatch.value)}
                className={`h-5 w-5 rounded-full border-2 transition-all cursor-pointer ${
                  newColor.toLowerCase() === swatch.value.toLowerCase()
                    ? 'border-foreground ring-1 ring-foreground ring-offset-1 scale-110'
                    : 'border-transparent hover:border-foreground/50'
                }`}
                style={{ backgroundColor: swatch.value }}
              />
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setNewColor(pickNextDefaultColor(tags.map((t) => t.color)))
            setShowCreate(true)
          }}
          data-testid="tag-create-btn"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-muted-foreground border border-dashed border-border hover:border-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Plus className="h-3 w-3" />
          Create tag
        </button>
      )}
    </div>
  )
}
