import { Node, mergeAttributes } from '@tiptap/core'

export interface VariableMentionOptions {
  /** Keys that are defined for the current game/challenge — used to flag undefined refs. */
  availableKeys: string[]
  HTMLAttributes: Record<string, unknown>
}

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
})
