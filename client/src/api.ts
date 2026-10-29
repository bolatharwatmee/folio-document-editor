import type {
  DemoUser,
  DocumentDetail,
  DocumentList,
  RichTextDoc,
  ShareEntry,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers:
        options.body === undefined
          ? undefined
          : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(
      0,
      "network_error",
      "Could not reach the server. Check your connection and try again.",
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = payload as
      | { error?: { code?: string; message?: string; details?: unknown } }
      | null;
    throw new ApiError(
      response.status,
      errorPayload?.error?.code ?? "request_failed",
      errorPayload?.error?.message ?? `The request failed (${response.status}).`,
      errorPayload?.error?.details,
    );
  }

  return payload as T;
}

function documentPath(id: string): string {
  return `/api/documents/${encodeURIComponent(id)}`;
}

export const api = {
  getSession: () => request<{ user: DemoUser | null }>("/api/session"),
  getDemoUsers: () => request<{ users: DemoUser[] }>("/api/demo-users"),
  signIn: (userId: string) =>
    request<{ user: DemoUser }>("/api/demo-session", {
      method: "POST",
      body: { userId },
    }),
  signOut: () =>
    request<{ ok: true }>("/api/session", {
      method: "DELETE",
    }),
  listDocuments: (query?: string) =>
    request<DocumentList>(
      query ? `/api/documents?q=${encodeURIComponent(query)}` : "/api/documents",
    ),
  createDocument: (input: { title?: string; content?: RichTextDoc }) =>
    request<{ document: DocumentDetail }>("/api/documents", {
      method: "POST",
      body: input,
    }),
  getDocument: (id: string) =>
    request<{ document: DocumentDetail }>(documentPath(id)),
  updateDocument: (
    id: string,
    input: { title?: string; content?: RichTextDoc; baseRevision: number },
  ) =>
    request<{ document: DocumentDetail }>(documentPath(id), {
      method: "PATCH",
      body: input,
    }),
  importText: (input: { filename: string; text: string }) =>
    request<{ document: DocumentDetail }>("/api/import", {
      method: "POST",
      body: input,
    }),
  listShares: (id: string) =>
    request<{ shares: ShareEntry[] }>(`${documentPath(id)}/shares`),
  addShare: (id: string, userId: string, role: "editor" | "viewer" = "editor") =>
    request<{ shares: ShareEntry[] }>(`${documentPath(id)}/shares`, {
      method: "POST",
      body: { userId, role },
    }),
  removeShare: (id: string, userId: string) =>
    request<{ shares: ShareEntry[] }>(
      `${documentPath(id)}/shares/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    ),
};
