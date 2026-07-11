import { Node, mergeAttributes } from '@tiptap/core'

export const FileEmbedExtension = Node.create({
  name: 'fileEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      resourceId: { default: null },
      resourceName: { default: 'File' },
      resourceSize: { default: 0 },
      resourceType: { default: 'application/octet-stream' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="file-embed"]',
        getAttrs: (el) => ({
          resourceId: (el as HTMLElement).getAttribute('data-resource-id'),
          resourceName: (el as HTMLElement).getAttribute('data-resource-name') || 'File',
          resourceSize: parseInt((el as HTMLElement).getAttribute('data-resource-size') || '0', 10),
          resourceType: (el as HTMLElement).getAttribute('data-resource-type') || 'application/octet-stream',
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const size = HTMLAttributes.resourceSize || 0
    const sizeLabel = size > 1024 * 1024
      ? `${(size / 1024 / 1024).toFixed(1)} MB`
      : size > 1024
        ? `${(size / 1024).toFixed(0)} KB`
        : `${size} B`

    return [
      'div',
      mergeAttributes({
        'data-type': 'file-embed',
        'data-resource-id': HTMLAttributes.resourceId,
        'data-resource-name': HTMLAttributes.resourceName,
        'data-resource-size': String(HTMLAttributes.resourceSize),
        'data-resource-type': HTMLAttributes.resourceType,
        style: 'margin: 0.5em 0; padding: 0.75em 1em; background: var(--pf-color-surface-subtle); border-radius: 8px; border-left: 4px solid var(--pf-dataColor-indigo); display: flex; align-items: center; gap: 0.75em; font-size: 0.9em;',
        contenteditable: 'false',
      }),
      ['span', { style: 'font-size: 1.2em;' }, '\u{1F4CE}'],
      [
        'span',
        {},
        ['strong', {}, HTMLAttributes.resourceName || 'File'],
        ['span', { style: 'color: var(--pf-color-content-muted); margin-left: 0.5em;' }, `(${sizeLabel})`],
      ],
    ]
  },
})
