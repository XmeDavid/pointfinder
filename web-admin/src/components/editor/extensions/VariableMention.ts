import { Node, mergeAttributes } from '@tiptap/core'
import { Suggestion, type SuggestionOptions } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import type { SuggestionItem } from '../VariableSuggestionList'

export interface VariableMentionOptions {
  /** Keys that are defined for the current game/challenge — used to flag undefined refs. */
  availableKeys: string[]
  HTMLAttributes: Record<string, unknown>
  /** Optional suggestion plugin config. When provided, `{{` triggers autocomplete. */
  suggestion?: Omit<SuggestionOptions<SuggestionItem>, 'editor'> | null
}

const variableSuggestionPluginKey = new PluginKey('variableSuggestion')

/**
 * Atomic pill node for `{{key}}` variable references.
 *
 * Round-trips with the shared `.variable-tag` span shape used by iOS/Android
 * WebView editors: `<span class="variable-tag" data-variable-key="KEY">{{KEY}}</span>`.
 *
 * When the `availableKeys` option does NOT include the node's `key`, the
 * rendered span additionally receives the `variable-tag--undefined` class so
 * users get a visual warning about typos / missing definitions.
 */
export const VariableMention = Node.create<VariableMentionOptions>({
  name: 'variableMention',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addOptions() {
    return {
      availableKeys: [],
      HTMLAttributes: {},
      suggestion: null,
    }
  },

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-variable-key'),
        renderHTML: (attrs) => ({ 'data-variable-key': attrs.key }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-variable-key]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const key = node.attrs.key as string
    const isUndefined = !this.options.availableKeys.includes(key)
    const className = isUndefined
      ? 'variable-tag variable-tag--undefined'
      : 'variable-tag'
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: className,
        'data-variable-key': key,
        contenteditable: 'false',
      }),
      `{{${key}}}`,
    ]
  },

  renderText({ node }) {
    return `{{${node.attrs.key}}}`
  },

  addProseMirrorPlugins() {
    const suggestion = this.options.suggestion
    if (!suggestion) return []
    return [
      Suggestion<SuggestionItem>({
        editor: this.editor,
        pluginKey: variableSuggestionPluginKey,
        ...suggestion,
      }),
    ]
  },
})
