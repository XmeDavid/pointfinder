import { Node, mergeAttributes } from "@tiptap/core";

export const AudioExtension = Node.create({
  name: "audio",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{
      tag: "audio",
      getAttrs: (el) => ({ src: (el as HTMLAudioElement).getAttribute("src") }),
    }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["audio", mergeAttributes(HTMLAttributes, {
      controls: "true", preload: "metadata", style: "width:100%;margin:0.5em 0",
    })];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.style.margin = "0.5em 0";
      dom.contentEditable = "false";

      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "metadata";
      audio.style.width = "100%";
      audio.src = node.attrs.src ?? "";
      dom.appendChild(audio);

      return { dom };
    };
  },
});
