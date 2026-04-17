import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

export interface SuggestionItem {
  key: string
  isCreate?: boolean
}

export interface VariableSuggestionListProps {
  items: SuggestionItem[]
  command: (item: SuggestionItem) => void
}

export interface VariableSuggestionListHandle {
  onKeyDown: (evt: { event: KeyboardEvent }) => boolean
}

export const VariableSuggestionList = forwardRef<
  VariableSuggestionListHandle,
  VariableSuggestionListProps
>(function VariableSuggestionList({ items, command }, ref) {
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    // Reset highlight when the suggestion list changes (different partial).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(0)
  }, [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[selected]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  if (!items.length) return null

  return (
    <div
      className="z-50 min-w-[220px] rounded-md border border-border bg-popover p-1 shadow-md"
      data-testid="variable-suggestion-list"
    >
      {items.map((item, idx) => (
        <button
          key={`${item.key}-${item.isCreate ? 'create' : 'pick'}`}
          type="button"
          onClick={() => command(item)}
          onMouseEnter={() => setSelected(idx)}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm cursor-pointer ${
            idx === selected
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50'
          }`}
          data-testid={
            item.isCreate
              ? 'variable-suggestion-create'
              : `variable-suggestion-${item.key}`
          }
        >
          {item.isCreate ? (
            <>
              <span className="text-xs opacity-60">+</span>
              <span>
                Create variable <code>{`{{${item.key}}}`}</code>
              </span>
            </>
          ) : (
            <code className="text-xs">{`{{${item.key}}}`}</code>
          )}
        </button>
      ))}
    </div>
  )
})
