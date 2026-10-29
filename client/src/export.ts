import type { RichTextDoc, RichTextNode } from "./types";

function serializeNodeToMarkdown(node: RichTextNode): string {
  if (node.type === "text") {
    let text = node.text || "";
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "bold") text = `**${text}**`;
        else if (mark.type === "italic") text = `*${text}*`;
        else if (mark.type === "underline") text = `<u>${text}</u>`;
      }
    }
    return text;
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  const children = node.content
    ? node.content.map(serializeNodeToMarkdown).join("")
    : "";

  if (node.type === "paragraph") {
    return children;
  }

  if (node.type === "heading") {
    const level = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
    const hashes = "#".repeat(Math.max(1, Math.min(6, level)));
    return `${hashes} ${children}`;
  }

  if (node.type === "bulletList") {
    if (!node.content) return "";
    return node.content
      .map(
        (item) =>
          `- ${item.content ? item.content.map(serializeNodeToMarkdown).join(" ").trim() : ""}`,
      )
      .join("\n");
  }

  if (node.type === "orderedList") {
    if (!node.content) return "";
    return node.content
      .map(
        (item, index) =>
          `${index + 1}. ${item.content ? item.content.map(serializeNodeToMarkdown).join(" ").trim() : ""}`,
      )
      .join("\n");
  }

  return children;
}

export function docToMarkdown(doc: RichTextDoc): string {
  if (!doc || !doc.content) return "";
  return doc.content.map(serializeNodeToMarkdown).join("\n\n");
}

export function docToPlainText(doc: RichTextDoc): string {
  function extractText(node: RichTextNode): string {
    if (node.type === "text") return node.text || "";
    if (node.type === "hardBreak") return "\n";
    if (node.content) {
      const joined = node.content.map(extractText).join("");
      if (
        node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "listItem"
      ) {
        return `${joined}\n`;
      }
      return joined;
    }
    return "";
  }
  if (!doc || !doc.content) return "";
  return doc.content
    .map(extractText)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function triggerDownload(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportDocument(
  doc: RichTextDoc,
  title: string,
  format: "md" | "txt" | "pdf",
): void {
  const safeName = (title.trim() || "document").replace(/[/\\?%*:|"<>]/g, "-");
  if (format === "md") {
    const md = docToMarkdown(doc);
    triggerDownload(md, `${safeName}.md`, "text/markdown;charset=utf-8");
  } else if (format === "txt") {
    const txt = docToPlainText(doc);
    triggerDownload(txt, `${safeName}.txt`, "text/plain;charset=utf-8");
  } else if (format === "pdf") {
    window.print();
  }
}
