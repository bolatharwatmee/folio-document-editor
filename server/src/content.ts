import { HttpError } from "./errors.js";

export const MAX_TITLE_LENGTH = 120;
export const MAX_CONTENT_CHARS = 250_000;
export const MAX_CONTENT_BYTES = 1_000_000;
export const MAX_NODES = 10_000;
export const MAX_DEPTH = 20;
export const MAX_IMPORT_BYTES = 200 * 1024;
export const MAX_IMPORT_LINES = 4_000;

export interface RichTextMark {
  type: "bold" | "italic" | "underline";
}

export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  text?: string;
  marks?: RichTextMark[];
}

export interface RichTextDoc {
  type: "doc";
  content: RichTextNode[];
}

const ALLOWED_MARKS = new Set(["bold", "italic", "underline"]);
const INLINE_NODES = new Set(["text", "hardBreak"]);
const BLOCK_NODES = new Set(["paragraph", "heading", "bulletList", "orderedList"]);

interface SanitizeState {
  nodeCount: number;
  charCount: number;
}

function contentError(message: string, status = 400, code = "invalid_content"): HttpError {
  return new HttpError(status, code, message);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw contentError(`Invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function countNode(state: SanitizeState): void {
  state.nodeCount += 1;
  if (state.nodeCount > MAX_NODES) {
    throw contentError(
      `Document content is too complex (maximum ${MAX_NODES.toLocaleString()} elements).`,
      413,
      "content_too_large",
    );
  }
}

function sanitizeMarks(value: unknown): RichTextMark[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw contentError("Invalid text formatting.");
  }

  const marks: RichTextMark[] = [];
  for (const mark of value) {
    const record = asRecord(mark, "text formatting");
    if (typeof record.type !== "string" || !ALLOWED_MARKS.has(record.type)) {
      throw contentError(`Unsupported text formatting: ${String(record.type ?? "unknown")}.`);
    }
    const type = record.type as RichTextMark["type"];
    if (!marks.some((existing) => existing.type === type)) {
      marks.push({ type });
    }
  }
  return marks;
}

function sanitizeInlineNode(
  input: unknown,
  state: SanitizeState,
  depth: number,
): RichTextNode | null {
  if (depth > MAX_DEPTH) {
    throw contentError("Document content is nested too deeply.");
  }

  const node = asRecord(input, "content element");
  const type = node.type;
  if (typeof type !== "string" || !INLINE_NODES.has(type)) {
    throw contentError(`Unsupported inline content: ${String(type ?? "unknown")}.`);
  }
  countNode(state);

  if (type === "hardBreak") {
    return { type: "hardBreak" };
  }

  if (typeof node.text !== "string") {
    throw contentError("Text content is missing its text value.");
  }
  if (node.text.includes("\u0000")) {
    throw contentError("Text content contains unsupported control characters.");
  }
  if (node.text.length === 0) {
    return null;
  }

  state.charCount += node.text.length;
  if (state.charCount > MAX_CONTENT_CHARS) {
    throw contentError(
      `Document text is too long (maximum ${MAX_CONTENT_CHARS.toLocaleString()} characters).`,
      413,
      "content_too_large",
    );
  }

  const marks = sanitizeMarks(node.marks);
  const sanitized: RichTextNode = { type: "text", text: node.text };
  if (marks.length > 0) {
    sanitized.marks = marks;
  }
  return sanitized;
}

function sanitizeInlineContent(
  value: unknown,
  state: SanitizeState,
  depth: number,
): RichTextNode[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw contentError("Invalid text block content.");
  }

  const content: RichTextNode[] = [];
  for (const child of value) {
    const sanitized = sanitizeInlineNode(child, state, depth + 1);
    if (sanitized) {
      content.push(sanitized);
    }
  }
  return content;
}

function sanitizeListItem(
  input: unknown,
  state: SanitizeState,
  depth: number,
): RichTextNode {
  const node = asRecord(input, "list item");
  if (node.type !== "listItem") {
    throw contentError("A list may only contain list items.");
  }
  countNode(state);

  if (!Array.isArray(node.content) || node.content.length === 0) {
    throw contentError("A list item cannot be empty.");
  }

  const content: RichTextNode[] = [];
  for (const child of node.content) {
    const childRecord = asRecord(child, "list item content");
    if (typeof childRecord.type !== "string" || !BLOCK_NODES.has(childRecord.type)) {
      throw contentError("A list item contains unsupported content.");
    }
    content.push(sanitizeBlockNode(childRecord, state, depth + 1));
  }

  return { type: "listItem", content };
}

function sanitizeBlockNode(
  input: unknown,
  state: SanitizeState,
  depth: number,
): RichTextNode {
  if (depth > MAX_DEPTH) {
    throw contentError("Document content is nested too deeply.");
  }

  const node = asRecord(input, "content element");
  const type = node.type;
  if (typeof type !== "string" || !BLOCK_NODES.has(type)) {
    throw contentError(`Unsupported content element: ${String(type ?? "unknown")}.`);
  }
  countNode(state);

  if (type === "paragraph") {
    return {
      type: "paragraph",
      content: sanitizeInlineContent(node.content, state, depth),
    };
  }

  if (type === "heading") {
    const attrs = node.attrs === undefined ? {} : asRecord(node.attrs, "heading attributes");
    const level = attrs.level ?? 1;
    if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 3) {
      throw contentError("Heading level must be 1, 2, or 3.");
    }
    return {
      type: "heading",
      attrs: { level },
      content: sanitizeInlineContent(node.content, state, depth),
    };
  }

  if (!Array.isArray(node.content) || node.content.length === 0) {
    throw contentError("A list cannot be empty.");
  }

  const items = node.content.map((item) => sanitizeListItem(item, state, depth + 1));
  if (type === "bulletList") {
    return { type: "bulletList", content: items };
  }

  const attrs = node.attrs === undefined ? {} : asRecord(node.attrs, "list attributes");
  const start = attrs.start ?? 1;
  if (typeof start !== "number" || !Number.isInteger(start) || start < 1 || start > 1_000_000) {
    throw contentError("Ordered list start must be a positive integer.");
  }
  return { type: "orderedList", attrs: { start }, content: items };
}

export function sanitizeRichText(input: unknown): RichTextDoc {
  const root = asRecord(input, "document content");
  if (root.type !== "doc") {
    throw contentError("Document content must be a rich-text document.");
  }

  const state: SanitizeState = { nodeCount: 1, charCount: 0 };
  let content: RichTextNode[] = [];

  if (root.content !== undefined) {
    if (!Array.isArray(root.content)) {
      throw contentError("Invalid document content.");
    }
    for (const child of root.content) {
      const record = asRecord(child, "document content");
      if (typeof record.type !== "string" || !BLOCK_NODES.has(record.type)) {
        throw contentError(`Unsupported content element: ${String(record.type ?? "unknown")}.`);
      }
      content.push(sanitizeBlockNode(record, state, 1));
    }
  }

  if (content.length === 0) {
    content = [{ type: "paragraph" }];
  }

  const doc: RichTextDoc = { type: "doc", content };
  if (Buffer.byteLength(JSON.stringify(doc), "utf8") > MAX_CONTENT_BYTES) {
    throw contentError("Document content is too large.", 413, "content_too_large");
  }
  return doc;
}

function inlineText(nodes: RichTextNode[] | undefined): string {
  if (!nodes) {
    return "";
  }
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return node.text ?? "";
      }
      if (node.type === "hardBreak") {
        return "\n";
      }
      return "";
    })
    .join("");
}

function blockText(node: RichTextNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  if (node.type === "paragraph" || node.type === "heading") {
    return inlineText(node.content);
  }
  if (node.type === "bulletList" || node.type === "orderedList" || node.type === "listItem") {
    return (node.content ?? []).map(blockText).join("\n");
  }
  return "";
}

export function extractPlainText(doc: RichTextDoc): string {
  return doc.content
    .map(blockText)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function emptyDocument(): RichTextDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function textToDocument(text: string): RichTextDoc {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const lines = normalized.split("\n");

  if (lines.length > MAX_IMPORT_LINES) {
    throw contentError(
      `The file has too many lines (maximum ${MAX_IMPORT_LINES.toLocaleString()}).`,
      413,
      "import_too_large",
    );
  }

  const content: RichTextNode[] = lines.map((line) => {
    if (line.length === 0) {
      return { type: "paragraph" };
    }
    return {
      type: "paragraph",
      content: [{ type: "text", text: line }],
    };
  });

  return sanitizeRichText({
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  });
}

export function cleanTitle(value: unknown, fallback?: string): string {
  if (typeof value !== "string") {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new HttpError(400, "invalid_title", "Document title must be text.");
  }

  const title = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (title.length === 0) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new HttpError(400, "invalid_title", "Document title cannot be empty.");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new HttpError(
      400,
      "invalid_title",
      `Document title must be ${MAX_TITLE_LENGTH} characters or fewer.`,
    );
  }
  return title;
}

export function titleFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const withoutExtension = base.replace(/\.txt$/i, "");
  return cleanTitle(withoutExtension, "Imported document");
}
