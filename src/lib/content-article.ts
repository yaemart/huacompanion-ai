import { safeURL, type Block } from "./content-model.ts";

const hiddenTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "SVG", "IFRAME"]);
const paragraphTags = new Set(["P", "DIV", "SECTION", "ARTICLE", "BLOCKQUOTE", "TD", "TH", "PRE"]);
const simplifiedTags = new Set(["B", "STRONG", "I", "EM", "U", "TABLE", "BLOCKQUOTE", "PRE"]);
export type OriginalBlocks = WeakMap<Element, { html: string; block: Block }>;

export const plainArticle = (value: string): Block[] =>
  value.split(/\r\n?|\n/).flatMap((text) => (text.trim() ? [{ type: "paragraph", text }] : []));

export function readArticle(root: Pick<ParentNode, "childNodes">, originals?: OriginalBlocks) {
  const blocks: Block[] = [];
  let buffer = "";
  let simplified = false;

  function flush(type: "paragraph" | "heading" | "list", listStart: number) {
    const text = buffer.trim();
    buffer = "";
    if (!text) return;
    const last = blocks.at(-1);
    if (type === "list" && blocks.length > listStart && last?.type === "list") {
      last.text += "\n" + text;
    } else {
      blocks.push({ type, text });
    }
  }

  let wordListStart = 0;
  function walk(
    parent: Pick<ParentNode, "childNodes">,
    type: "paragraph" | "heading" | "list",
    listStart = 0,
  ) {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 3) {
        buffer += node.nodeValue ?? "";
        continue;
      }
      if (node.nodeType !== 1) continue;
      const child = node as Element;
      const original = originals?.get(child);
      if (original && original.html === child.outerHTML) {
        flush(type, listStart);
        blocks.push(original.block);
        continue;
      }
      const tag = child.tagName.toUpperCase();
      if (hiddenTags.has(tag)) continue;
      const style = child.getAttribute("style") ?? "";
      if (/mso-list:\s*ignore/i.test(style)) continue;
      if (simplifiedTags.has(tag) || /font-|color:|text-decoration:/i.test(style))
        simplified = true;
      if (tag === "BR") {
        buffer += type === "list" ? " " : "\n";
        if (type === "list") simplified = true;
      } else if (tag === "IMG") {
        simplified = true;
        buffer += child.getAttribute("alt") ?? "";
      } else if (tag === "A") {
        const url = child.getAttribute("href");
        if (url && safeURL(url)) {
          if (buffer.trim() || child.nextSibling?.textContent?.trim() || type !== "paragraph")
            simplified = true;
          flush(type, listStart);
          const label = readArticle(child);
          simplified ||= label.simplified;
          blocks.push({
            type: "link",
            text: label.blocks.map((part) => part.text).join(" ") || url,
            url,
          });
        } else {
          if (url) simplified = true;
          walk(child, type, listStart);
        }
      } else if (tag === "UL" || tag === "OL") {
        if (tag === "OL" || type === "list") simplified = true;
        flush(type, listStart);
        const start = type === "list" ? listStart : blocks.length;
        walk(child, "list", start);
        flush("list", start);
      } else if (tag === "P" && /mso-list:/i.test(style)) {
        simplified = true;
        flush(type, listStart);
        walk(child, "list", wordListStart);
        flush("list", wordListStart);
      } else if (paragraphTags.has(tag) || tag === "LI" || /^H[1-6]$/.test(tag)) {
        flush(type, listStart);
        const heading =
          /^H[1-6]$/.test(tag) || /\bMsoHeading[1-6]\b/i.test(child.getAttribute("class") ?? "");
        const childType = heading ? "heading" : type;
        walk(child, childType, listStart);
        flush(childType, listStart);
        if (type !== "list") wordListStart = blocks.length;
      } else {
        walk(child, type, listStart);
      }
    }
  }

  walk(root, "paragraph");
  flush("paragraph", 0);
  return { blocks, simplified };
}

export function articleNode(document: Document, block: Block) {
  if (block.type === "list") {
    const list = document.createElement("ul");
    for (const text of (block.text ?? "").split("\n")) {
      const item = document.createElement("li");
      item.textContent = text;
      list.append(item);
    }
    return list;
  }
  const paragraph = document.createElement(block.type === "heading" ? "h2" : "p");
  if (block.type === "link" && block.url && safeURL(block.url)) {
    const link = document.createElement("a");
    link.href = block.url;
    link.textContent = block.text || block.url;
    paragraph.append(link);
  } else {
    paragraph.textContent = block.text ?? "";
  }
  return paragraph;
}
