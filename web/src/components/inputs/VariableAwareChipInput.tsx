import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type SyntheticEvent,
  type Ref,
} from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import {
  VariableSuggestionList,
  type SuggestionItem,
  type VariableSuggestionListHandle,
} from '@/components/editor/VariableSuggestionList'
import { completeReference, findOpenReference } from './chipReferences'

const REF_RE = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g

export interface VariableAwareChipInputProps {
  ref?: Ref<VariableAwareChipInputHandle>
  chips: string[]
  onChange: (chips: string[]) => void
  availableKeys: string[]
  placeholder?: string
  'data-testid'?: string
}

export interface VariableAwareChipInputHandle {
  discardPending: () => void
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

interface EditingChip {
  index: number
  /** The chip as it was when editing started, to find it again if the list moved. */
  original: string
  value: string
}

/**
 * Where an edit lands after the chips may have been replaced underneath it
 * (a landed autosave, a recovered draft): the same slot if it still holds the
 * original, else wherever the original went, else nowhere (-1).
 */
function locateChip(chips: string[], editing: EditingChip): number {
  if (chips[editing.index] === editing.original) return editing.index
  return chips.indexOf(editing.original)
}

/** Applies a finished edit; an edit whose chip vanished is kept as a new chip rather than dropped. */
function applyEdit(chips: string[], editing: EditingChip): string[] | null {
  const value = editing.value.trim()
  // An emptied chip keeps its value: removing one is the explicit control.
  if (!value || value === editing.original) return null
  const at = locateChip(chips, editing)
  if (at === -1) return chips.includes(value) ? null : [...chips, value]
  return chips.map((chip, idx) => (idx === at ? value : chip))
}

/**
 * A chip-array input with inline variable pill rendering.
 *
 * Each chip is a string that may contain literal text, `{{key}}` references,
 * or a mix (e.g. `"{{prefix}}-FOX"`). References to keys not in `availableKeys`
 * render with the `.variable-tag--undefined` warning style. Typing `{{` in the
 * add or edit field offers the available keys; a chip is edited in place by
 * pressing it. Text left in a field is committed on blur and on unmount, so a
 * toggle or a save never silently drops an answer that was still being typed.
 *
 * Matches iOS/Android `correctAnswer` UX (one chip per accepted answer).
 */
export function VariableAwareChipInput({
  ref,
  chips,
  onChange,
  availableKeys,
  placeholder,
  'data-testid': testId = 'variable-chip-input',
}: VariableAwareChipInputProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<EditingChip | null>(null)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<VariableSuggestionListHandle>(null)
  const [caret, setCaret] = useState(0)

  // The field being typed in: the chip under edit wins over the add field.
  const activeValue = editing ? editing.value : draft
  const open = useMemo(
    () => (suggestionsDismissed ? null : findOpenReference(activeValue, Math.min(caret, activeValue.length))),
    [activeValue, caret, suggestionsDismissed],
  )
  const suggestions = useMemo<SuggestionItem[]>(() => {
    if (!open) return []
    const q = open.query.toLowerCase()
    return availableKeys
      .filter((key) => key.toLowerCase().includes(q))
      .slice(0, 10)
      .map((key) => ({ key }))
  }, [open, availableKeys])
  const suggestionsVisible = suggestions.length > 0

  // Whatever is still typed when the input goes away belongs to the answers.
  const latest = useRef({ draft, editing, chips, onChange })
  useImperativeHandle(ref, () => ({
    discardPending: () => {
      latest.current = { ...latest.current, draft: '', editing: null }
      setDraft('')
      setEditing(null)
      setSuggestionsDismissed(true)
    },
  }), [])
  useEffect(() => {
    latest.current = { draft, editing, chips, onChange }
  })
  useEffect(
    () => () => {
      const { draft: pendingDraft, editing: pendingEdit, chips: current, onChange: emit } = latest.current
      let next = current
      if (pendingEdit) next = applyEdit(next, pendingEdit) ?? next
      const added = pendingDraft.trim()
      if (added) next = [...next, added]
      if (next !== current) emit(next)
    },
    [],
  )

  const trackCaret = (event: SyntheticEvent<HTMLInputElement>) => {
    setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length)
  }

  const commitDraft = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    onChange([...chips, trimmed])
    setDraft('')
  }

  const commitEdit = () => {
    if (!editing) return
    const next = applyEdit(chips, editing)
    if (next) onChange(next)
    setEditing(null)
  }

  const cancelEdit = () => setEditing(null)

  const applySuggestion = (item: SuggestionItem) => {
    const input = editing ? editInputRef.current : addInputRef.current
    const completed = completeReference(activeValue, Math.min(caret, activeValue.length), item.key)
    if (editing) setEditing({ ...editing, value: completed.value })
    else setDraft(completed.value)
    setCaret(completed.caret)
    setSuggestionsDismissed(false)
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(completed.caret, completed.caret)
    })
  }

  /** Shared arrow/Enter/Tab/Escape handling while the list is open. */
  const handleSuggestionKeys = (event: KeyboardEvent<HTMLInputElement>): boolean => {
    if (!suggestionsVisible) return false
    if (event.key === 'Escape') {
      event.preventDefault()
      setSuggestionsDismissed(true)
      return true
    }
    const handled = listRef.current?.onKeyDown({ event: event.nativeEvent }) ?? false
    if (handled) event.preventDefault()
    return handled
  }

  const handleAddKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    trackCaret(event)
    if (handleSuggestionKeys(event)) return
    if (event.key === 'Enter') {
      if (!draft.trim()) return
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Backspace' && !draft && chips.length) {
      onChange(chips.slice(0, -1))
    }
  }

  const handleEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    trackCaret(event)
    if (handleSuggestionKeys(event)) return
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEdit()
      requestAnimationFrame(() => addInputRef.current?.focus())
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEdit()
      requestAnimationFrame(() => addInputRef.current?.focus())
    }
  }

  /** Focus moving into the suggestion list is still this field's editing session. */
  const leavesInput = (event: FocusEvent<HTMLInputElement>) =>
    !(event.relatedTarget instanceof Node && suggestionsRef.current?.contains(event.relatedTarget))

  const removeChip = (idx: number) => {
    const next = [...chips]
    next.splice(idx, 1)
    onChange(next)
    if (editing && locateChip(chips, editing) === idx) setEditing(null)
  }

  const startEdit = (idx: number) => {
    commitDraft()
    setCaret(chips[idx].length)
    setSuggestionsDismissed(true)
    setEditing({ index: idx, original: chips[idx], value: chips[idx] })
  }

  const list = suggestionsVisible ? (
    <div
      ref={suggestionsRef}
      className="absolute left-0 top-full z-50 mt-1"
      data-testid="chip-suggestions"
      aria-label={t('common.chips.suggestions')}
      // Keep focus in the input while a suggestion is pressed or tapped.
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => event.preventDefault()}
    >
      <VariableSuggestionList ref={listRef} items={suggestions} command={applySuggestion} />
    </div>
  ) : null

  return (
    <div
      ref={rootRef}
      className="flex flex-wrap items-center gap-2 rounded-md border border-input px-2 py-1.5 bg-background"
      data-testid={testId}
    >
      {chips.map((chip, idx) =>
        editing && locateChip(chips, editing) === idx ? (
          <span key={`${idx}-edit`} className="relative inline-flex min-w-[160px] flex-1">
            <input
              ref={editInputRef}
              type="text"
              autoFocus
              value={editing.value}
              aria-label={t('common.chips.editing', { value: chip })}
              onChange={(event) => {
                trackCaret(event)
                setSuggestionsDismissed(false)
                setEditing({ ...editing, value: event.target.value })
              }}
              onSelect={trackCaret}
              onKeyDown={handleEditKeyDown}
              onBlur={(event) => {
                if (leavesInput(event)) commitEdit()
              }}
              data-testid="chip-edit-input"
              className="w-full rounded bg-muted px-2 py-0.5 text-sm outline-none ring-1 ring-ring"
            />
            {list}
          </span>
        ) : (
          <span
            key={`${idx}-${chip}`}
            className="inline-flex items-center gap-1 rounded bg-muted pl-2 pr-1 text-sm"
          >
            <button
              type="button"
              onClick={() => startEdit(idx)}
              data-testid={`chip-edit-${idx}`}
              aria-label={t('common.chips.edit', { value: chip })}
              className="min-h-8 cursor-pointer py-0.5 text-left"
            >
              {renderChipContent(chip, availableKeys)}
            </button>
            <button
              type="button"
              onClick={() => removeChip(idx)}
              data-testid={`chip-remove-${idx}`}
              aria-label={t('common.chips.remove', { value: chip })}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        ),
      )}
      <span className="relative flex-1 min-w-[160px]">
        <input
          ref={addInputRef}
          type="text"
          value={draft}
          aria-label={t('common.chips.add')}
          aria-autocomplete="list"
          aria-expanded={!editing && suggestionsVisible}
          onChange={(event) => {
            trackCaret(event)
            setSuggestionsDismissed(false)
            setDraft(event.target.value)
          }}
          onSelect={trackCaret}
          onKeyDown={handleAddKeyDown}
          onBlur={(event) => {
            if (leavesInput(event)) commitDraft()
          }}
          placeholder={placeholder ?? t('common.chips.placeholder', { example: '{{variable}}' })}
          data-testid="chip-add-input"
          className="w-full min-h-8 bg-transparent outline-none text-sm"
        />
        {!editing && list}
      </span>
    </div>
  )
}
