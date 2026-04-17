import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { VariableMention } from './VariableMention'

function makeEditor(html: string, availableKeys: string[] = ['secret']) {
  return new Editor({
    extensions: [StarterKit, VariableMention.configure({ availableKeys })],
    content: html,
  })
}

describe('VariableMention', () => {
  it('parses {{secret}} from initial HTML into a variableMention node', () => {
    const editor = makeEditor(
      '<p><span class="variable-tag" data-variable-key="secret">{{secret}}</span></p>',
    )
    const json = editor.getJSON()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const para = (json.content as any[])[0]
    expect(para.content[0].type).toBe('variableMention')
    expect(para.content[0].attrs.key).toBe('secret')
  })

  it('serializes a mention node back to the span', () => {
    const editor = makeEditor(
      '<p><span class="variable-tag" data-variable-key="secret">{{secret}}</span></p>',
    )
    const html = editor.getHTML()
    expect(html).toContain('data-variable-key="secret"')
    expect(html).toContain('{{secret}}')
  })

  it('marks an undefined key with the undefined class', () => {
    const editor = makeEditor(
      '<p><span class="variable-tag" data-variable-key="missing">{{missing}}</span></p>',
      ['secret'],
    )
    const html = editor.getHTML()
    expect(html).toContain('variable-tag--undefined')
  })

  it('getText renders the mention as {{key}} plain text', () => {
    const editor = makeEditor(
      '<p>Find <span class="variable-tag" data-variable-key="secret">{{secret}}</span></p>',
    )
    // Use getText with the custom serializer in the extension.
    const text = editor.getText({
      blockSeparator: '\n',
      textSerializers: {
        variableMention: ({ node }) => `{{${node.attrs.key}}}`,
      },
    })
    expect(text).toContain('{{secret}}')
  })
})
