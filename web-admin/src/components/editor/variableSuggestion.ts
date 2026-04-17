import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions } from '@tiptap/suggestion'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import {
  VariableSuggestionList,
  type SuggestionItem,
  type VariableSuggestionListHandle,
} from './VariableSuggestionList'

export interface VariableSuggestionFactoryOpts {
  getAvailableKeys: () => string[]
  onCreate?: (partialKey: string) => void
}

/**
 * Build a TipTap `SuggestionOptions` value configured for `{{key}}`-style
 * variable autocomplete.
 *
 * The trigger character is the literal two-brace sequence `{{`. TipTap's
 * built-in `findSuggestionMatch` uses the `char` option as an escaped regex
 * literal and handles multi-character triggers correctly — see
 * `@tiptap/suggestion/src/findSuggestionMatch.ts`.
 *
 * We set `allowedPrefixes: null` so the trigger fires regardless of what
 * comes before it (the default requires a leading space / BOF).
 */
export function makeVariableSuggestion(
  opts: VariableSuggestionFactoryOpts,
): Omit<SuggestionOptions<SuggestionItem>, 'editor'> {
  return {
    char: '{{',
    startOfLine: false,
    allowSpaces: false,
    allowedPrefixes: null,

    items: ({ query }) => {
      const keys = opts.getAvailableKeys()
      const q = query.toLowerCase()
      const filtered = keys
        .filter((k) => k.toLowerCase().includes(q))
        .slice(0, 10)
        .map<SuggestionItem>((key) => ({ key }))
      const hasExact = keys.some((k) => k.toLowerCase() === q)
      if (query && !hasExact && opts.onCreate) {
        filtered.push({ key: query, isCreate: true })
      }
      return filtered
    },

    command: ({ editor, range, props }) => {
      if (props.isCreate) {
        opts.onCreate?.(props.key)
        editor.chain().focus().deleteRange(range).run()
        return
      }
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: 'variableMention', attrs: { key: props.key } },
          { type: 'text', text: ' ' },
        ])
        .run()
    },

    render: () => {
      let component: ReactRenderer<VariableSuggestionListHandle> | undefined
      let popup: TippyInstance | undefined

      return {
        onStart: (props) => {
          component = new ReactRenderer(VariableSuggestionList, {
            props,
            editor: props.editor,
          })
          if (!props.clientRect) return
          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
          })
        },
        onUpdate: (props) => {
          component?.updateProps(props)
          if (!props.clientRect || !popup) return
          popup.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          })
        },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            popup?.hide()
            return true
          }
          return component?.ref?.onKeyDown(props) ?? false
        },
        onExit: () => {
          popup?.destroy()
          component?.destroy()
          popup = undefined
          component = undefined
        },
      }
    },
  }
}
