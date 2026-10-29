export interface DemoUser {
  id: string;
  name: string;
  email: string;
  color: string;
  roleLabel: string;
}

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

export type ShareRole = "owner" | "editor" | "viewer";

export interface DocumentSummary {
  id: string;
  title: string;
  snippet: string;
  revision: number;
  owner: DemoUser;
  access: "owner" | "shared";
  shareRole?: ShareRole;
  createdAt: string;
  updatedAt: string;
  shareCount: number;
  sharedAt?: string;
}

export interface ShareEntry {
  user: DemoUser;
  role: "editor" | "viewer";
  sharedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  content: RichTextDoc;
  updatedBy: DemoUser;
  canEdit: boolean;
  canShare: boolean;
  shares?: ShareEntry[];
}

export interface DocumentList {
  owned: DocumentSummary[];
  shared: DocumentSummary[];
}
