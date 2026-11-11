import { useLayoutEffect, useRef, useState, type ClipboardEvent } from "react";
import { articleNode, plainArticle, readArticle, type OriginalBlocks } from "@/lib/content-article";
import { safeURL, type Block } from "@/lib/content-model";

type ArticleEditorProps = {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  disabled: boolean;
};
export function ArticleEditor({ blocks, onChange, disabled }: ArticleEditorProps) {
  const editor = useRef<HTMLDivElement>(null);
  const current = useRef<Block[] | null>(null);
  const range = useRef<Range | null>(null);
  const originals = useRef<OriginalBlocks>(new WeakMap());
  const [link, setLink] = useState<{ url: string; anchor?: HTMLAnchorElement } | null>(null);
  const [notice, setNotice] = useState("");
  useLayoutEffect(() => {
    const root = editor.current;
    const previous = current.current;
    if (!root || (previous?.length === blocks.length && previous.every((b, i) => b === blocks[i])))
      return;
    const nodes = blocks.map((block) => {
      const node = articleNode(root.ownerDocument, block);
      originals.current.set(node, { html: node.outerHTML, block });
      return node;
    });
    root.replaceChildren(...nodes);
    current.current = blocks;
    range.current = null;
  }, [blocks]);

  function update() {
    if (!editor.current || disabled) return;
    const next = readArticle(editor.current, originals.current).blocks;
    current.current = next;
    onChange(next);
  }

  function command(name: string, value?: string) {
    const root = editor.current;
    if (!root || disabled) return;
    const document = root.ownerDocument;
    const selection = document.getSelection();
    if (!selection) return;
    const active = selection.rangeCount ? selection.getRangeAt(0) : null;
    const target = root.contains(active?.commonAncestorContainer ?? null) ? active : range.current;
    root.focus();
    if (target && root.contains(target.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(target);
    } else {
      selection.collapse(root, root.childNodes.length);
    }
    // Native editing retains the browser's undo history when supported.
    if (!document.execCommand?.(name, false, value)) setNotice("浏览器无法应用此格式。");
    range.current = null;
    update();
  }

  function insert(blocks: Block[]) {
    const document = editor.current?.ownerDocument;
    if (!document || !blocks.length) return;
    const fragment = document.createElement("div");
    fragment.append(...blocks.map((block) => articleNode(document, block)));
    command("insertHTML", fragment.innerHTML);
  }

  function paste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    const clipboard = event.clipboardData;
    const template = event.currentTarget.ownerDocument.createElement("template");
    // Keep the clipboard DOM inert. Only freshly created editor nodes are inserted.
    template.innerHTML = clipboard.getData("text/html");
    let result;
    try {
      result = readArticle(template.content);
    } catch {
      result = { blocks: [], simplified: true };
    }
    setNotice(
      result.simplified || clipboard.files.length
        ? "部分格式已简化，请检查列表和链接。图片请通过素材入口添加。"
        : "",
    );
    insert(result.blocks.length ? result.blocks : plainArticle(clipboard.getData("text/plain")));
  }

  function addLink() {
    const url = link?.url.trim();
    if (!url || !safeURL(url)) return setNotice("请输入有效的 http 或 https 链接。");
    if (!link?.anchor) {
      insert([{ type: "link", text: range.current?.toString().trim() || url, url }]);
    } else if (editor.current?.contains(link.anchor)) {
      link.anchor.setAttribute("href", url);
      update();
    }
    setLink(null);
    setNotice("");
  }

  return (
    <div>
      {!disabled && (
        <div role="group" aria-label="正文格式">
          {[
            ["小标题", "formatBlock", "h2"],
            ["段落", "formatBlock", "p"],
            ["列表", "insertUnorderedList"],
          ].map(([label, name, value]) => (
            <button type="button" key={label} onClick={() => command(name, value)}>
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setLink(link === null ? { url: "" } : null)}
            aria-expanded={link !== null}
          >
            链接
          </button>
        </div>
      )}
      {!disabled && link !== null && (
        <div>
          <label>
            链接网址
            <input
              value={link.url}
              onChange={(e) => setLink({ ...link, url: e.target.value })}
              type="url"
            />
          </label>
          <button type="button" onClick={addLink}>
            {link.anchor ? "更新链接" : "插入链接"}
          </button>
        </div>
      )}
      <div
        ref={editor}
        className="block article-text"
        role="textbox"
        aria-label="正文"
        aria-multiline="true"
        aria-readonly={disabled}
        hidden={disabled && !blocks.length}
        contentEditable={!disabled}
        onInput={update}
        onPaste={paste}
        onDrop={(e) => e.preventDefault()}
        onBlur={() => {
          const selected = editor.current?.ownerDocument.getSelection();
          const active = selected?.rangeCount ? selected.getRangeAt(0) : null;
          if (active && editor.current?.contains(active.commonAncestorContainer))
            range.current = active.cloneRange();
        }}
        onClick={(e) => {
          const anchor = (e.target as Element).closest("a");
          if (!anchor) return;
          e.preventDefault();
          if (!disabled) setLink({ url: anchor.getAttribute("href") ?? "", anchor });
        }}
      />
      {notice && <small role="status">{notice}</small>}
    </div>
  );
}
