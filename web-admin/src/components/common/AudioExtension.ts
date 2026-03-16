import { Node, mergeAttributes } from "@tiptap/core";

export const AudioExtension = Node.create({
  name: "audio",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{ tag: "audio" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["audio", mergeAttributes(HTMLAttributes, {
      controls: "", style: "width:100%;margin:0.5em 0"
    })];
  },
});
