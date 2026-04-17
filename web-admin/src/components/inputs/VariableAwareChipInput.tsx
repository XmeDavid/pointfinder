import { useState, type KeyboardEvent } from 'react'

const REF_RE = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g

export interface VariableAwareChipInputProps {
  chips: string[]
  onChange: (chips: string[]) => void
  availableKeys: string[]
  placeholder?: string
  'data-testid'?: string
}

interface ChipPart {
  kind: 'text' | 'pill'
  value: string
  key?: string
}

function splitChip(chip: string): ChipPart[] {
  const parts: ChipPart[] = []
  let last = 0
  for (const m of chip.matchAll(REF_RE)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push({ kind: 'text', value: chip.slice(last, idx) })
    parts.push({ kind: 'pill', value: m[0], key: m[1] })
    last = idx + m[0].length
  }
  if (last < chip.length) parts.push({ kind: 'text', value: chip.slice(last) })
  if (parts.length === 0) parts.push({ kind: 'text', value: chip })
  return parts
}

function renderChipContent(chip: string, availableKeys: string[]) {
  const parts = splitChip(chip)
  return parts.map((p, i) => {
    if (p.kind === 'text') return <span key={i}>{p.value}</span>
    const undef = !availableKeys.includes(p.key!)
    return (
      <span
        key={i}
        data-testid={`chip-pill-${p.key}`}
        className={
          undef ? 'variable-tag variable-tag--undefined' : 'variable-tag'
        }
      >
        {p.value}
      </span>
    )
  })
}

/**
 * A chip-array input with inline variable pill rendering.
 *
 * Each chip is a string that may contain literal text, `{{key}}` references,
 * or a mix (e.g. `"{{prefix}}-FOX"`). References to keys not in `availableKeys`
 * render with the `.variable-tag--undefined` warning style.
 *
 * Matches iOS/Android `correctAnswer` UX (one chip per accepted answer).
 */
export function VariableAwareChipInput({
  chips,
  onChange,
  availableKeys,
  placeholder = 'Type an answer or {{variable}}…',
  'data-testid': testId = 'variable-chip-input',
}: VariableAwareChipInputProps) {
  const [draft, setDraft] = useState('')

  const commitDraft = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    onChange([...chips, trimmed])
    setDraft('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (!draft.trim()) return
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Backspace' && !draft && chips.length) {
      onChange(chips.slice(0, -1))
    }
  }

  const removeChip = (idx: number) => {
    const next = [...chips]
    next.splice(idx, 1)
    onChange(next)
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border border-input px-2 py-1.5 bg-background"
      data-testid={testId}
    >
      {chips.map((chip, idx) => (
        <span
          key={`${idx}-${chip}`}
          className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-sm"
        >
          {renderChipContent(chip, availableKeys)}
          <button
            type="button"
            onClick={() => removeChip(idx)}
            data-testid={`chip-remove-${idx}`}
            aria-label={`Remove ${chip}`}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        placeholder={placeholder}
        data-testid="chip-add-input"
        className="flex-1 min-w-[160px] bg-transparent outline-none text-sm"
      />
    </div>
  )
}
