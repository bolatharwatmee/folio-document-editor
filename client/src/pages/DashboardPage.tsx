import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  FilePlus2,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import { api, ApiError } from "../api";
import { useApp } from "../context/AppContext";
import type { DocumentList, DocumentSummary } from "../types";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_LABEL,
  firstName,
  formatDateTime,
  formatRelativeTime,
  greeting,
  pluralize,
} from "../utils";
import { useNow } from "../hooks/useNow";
import { Avatar, DocumentGlyph, Spinner } from "../components/Brand";
import { Banner } from "../components/Banner";

function DocumentRow({
  document,
  now,
}: {
  document: DocumentSummary;
  now: number;
}) {
  return (
    <Link
      to={`/documents/${document.id}`}
      className="document-row"
      aria-label={`Open ${document.title}`}
    >
      <DocumentGlyph />
      <span className="document-row-main">
        <span className="document-row-titleline">
          <span className="document-row-title">{document.title}</span>
          {document.access === "shared" && (
            <span
              className={`access-badge ${
                document.shareRole === "viewer"
                  ? "access-badge-viewer"
                  : "access-badge-shared"
              }`}
            >
              {document.shareRole === "viewer" ? "View only" : "Shared"}
            </span>
          )}
          {document.access === "owner" && document.shareCount > 0 && (
            <span className="access-badge access-badge-collaborators">
              Shared with {document.shareCount}
            </span>
          )}
        </span>
        <span className="document-row-snippet">
          {document.snippet || "No content yet."}
        </span>
      </span>
      <span className="document-row-meta">
        {document.access === "shared" ? (
          <span className="document-row-person">
            <Avatar
              name={document.owner.name}
              color={document.owner.color}
              size="sm"
            />
            Shared by {firstName(document.owner.name)}
          </span>
        ) : (
          <span className="document-row-person muted">Owned by you</span>
        )}
        <span className="document-row-date" title={formatDateTime(document.updatedAt)}>
          {formatRelativeTime(document.updatedAt, now)}
        </span>
      </span>
    </Link>
  );
}

function SkeletonRows() {
  return (
    <div className="document-list" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div className="document-row skeleton-row" key={index}>
          <span className="skeleton skeleton-glyph" />
          <span className="skeleton-row-main">
            <span className="skeleton skeleton-line skeleton-line-title" />
            <span className="skeleton skeleton-line skeleton-line-body" />
          </span>
          <span className="skeleton skeleton-line skeleton-line-meta" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useApp();
  const navigate = useNavigate();
  const now = useNow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<DocumentList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<"owned" | "shared">("owned");
  const [searchQuery, setSearchQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Folio — Your documents";
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setLoadError(null);

    api
      .listDocuments()
      .then((result) => {
        if (!ignore) {
          setData(result);
        }
      })
      .catch((error) => {
        if (!ignore) {
          setLoadError(
            error instanceof ApiError ? error.message : "Could not load documents.",
          );
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [user?.id, reloadKey]);

  if (!user) {
    return null;
  }

  const owned = data?.owned ?? [];
  const shared = data?.shared ?? [];

  const filterBySearch = (doc: DocumentSummary) => {
    if (!searchQuery.trim()) {
      return true;
    }
    const q = searchQuery.toLowerCase().trim();
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.snippet.toLowerCase().includes(q) ||
      doc.owner.name.toLowerCase().includes(q)
    );
  };

  const filteredOwned = owned.filter(filterBySearch);
  const filteredShared = shared.filter(filterBySearch);
  const activeDocuments = tab === "owned" ? filteredOwned : filteredShared;

  const createDocument = async () => {
    if (creating) {
      return;
    }
    setCreating(true);
    setActionError(null);
    try {
      const result = await api.createDocument({ title: "Untitled document" });
      navigate(`/documents/${result.document.id}`);
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : "Could not create a document.",
      );
      setCreating(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || importing) {
      return;
    }
    setActionError(null);

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setActionError("Only UTF-8 .txt files are supported.");
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setActionError(`That file is larger than ${MAX_IMPORT_LABEL}. Choose a smaller .txt file.`);
      return;
    }

    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        setActionError("That file is not valid UTF-8 text.");
        return;
      }

      if (text.trim().length === 0) {
        setActionError("That file is empty. Add some text and try again.");
        return;
      }

      const result = await api.importText({ filename: file.name, text });
      navigate(`/documents/${result.document.id}`);
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : "Could not import that file.",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="eyebrow">Your workspace</span>
          <h1>
            {greeting()}, {firstName(user.name)}.
          </h1>
          <p className="dashboard-subtitle">
            Write, format, and share. Saves are explicit, and every access check
            happens on the server.
          </p>
          <div className="workspace-stats">
            <span>{pluralize(owned.length, "owned document")}</span>
            <span className="stat-dot" aria-hidden="true" />
            <span>{pluralize(shared.length, "shared document")}</span>
          </div>
        </div>

        <div className="dashboard-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Spinner label="Importing" /> : <Upload size={17} />}
            {importing ? "Importing…" : "Import .txt"}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void createDocument()}
            disabled={creating}
          >
            {creating ? <Spinner label="Creating document" /> : <Plus size={17} />}
            {creating ? "Creating…" : "New document"}
          </button>
          <span className="action-hint">
            UTF-8 .txt, up to {MAX_IMPORT_LABEL}. Imports create a new document.
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              void handleFile(file);
              event.target.value = "";
            }}
          />
        </div>
      </section>

      {actionError && (
        <Banner tone="error" onDismiss={() => setActionError(null)}>
          {actionError}
        </Banner>
      )}

      <section className="documents-section" aria-labelledby="documents-heading">
        <div className="documents-toolbar">
          <h2 id="documents-heading" className="visually-hidden">
            Documents
          </h2>
          <div className="tabs" role="tablist" aria-label="Document collections">
            <button
              type="button"
              role="tab"
              id="tab-owned"
              aria-selected={tab === "owned"}
              aria-controls="documents-panel"
              className={`tab${tab === "owned" ? " tab-active" : ""}`}
              onClick={() => setTab("owned")}
            >
              My documents <span className="tab-count">{owned.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              id="tab-shared"
              aria-selected={tab === "shared"}
              aria-controls="documents-panel"
              className={`tab${tab === "shared" ? " tab-active" : ""}`}
              onClick={() => setTab("shared")}
            >
              Shared with me <span className="tab-count">{shared.length}</span>
            </button>
          </div>

          <div className="search-bar">
            <Search size={15} className="search-icon" aria-hidden="true" />
            <input
              type="search"
              className="search-input"
              placeholder="Search documents…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search documents by title, author, or content"
            />
            {searchQuery && (
              <button
                type="button"
                className="icon-button search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="icon-text-button"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>

        <div
          id="documents-panel"
          role="tabpanel"
          aria-labelledby={tab === "owned" ? "tab-owned" : "tab-shared"}
          className="documents-panel"
        >
          {loading && !data && <SkeletonRows />}

          {loadError && (
            <Banner
              tone="error"
              title="Documents did not load"
              action={
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={() => setReloadKey((key) => key + 1)}
                >
                  Try again
                </button>
              }
            >
              {loadError}
            </Banner>
          )}

          {!loading && !loadError && activeDocuments.length === 0 && (
            <div className="empty-state">
              <span className="empty-state-icon" aria-hidden="true">
                {searchQuery ? (
                  <Search size={30} />
                ) : tab === "owned" ? (
                  <FilePlus2 size={30} />
                ) : (
                  <Users size={30} />
                )}
              </span>
              <h3>
                {searchQuery
                  ? "No matching documents"
                  : tab === "owned"
                    ? "No documents yet"
                    : "Nothing shared with you yet"}
              </h3>
              <p>
                {searchQuery
                  ? `No documents matched “${searchQuery}”. Try a different title or keyword.`
                  : tab === "owned"
                    ? "Start with a blank page or import a UTF-8 .txt file. Everything is saved to the server."
                    : "When another demo user shares a document with you, it appears here."}
              </p>
              {searchQuery ? (
                <div className="empty-state-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                tab === "owned" && (
                  <div className="empty-state-actions">
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => void createDocument()}
                      disabled={creating}
                    >
                      <Plus size={17} />
                      New document
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importing}
                    >
                      <Upload size={17} />
                      Import .txt
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {activeDocuments.length > 0 && (
            <div className="document-list">
              {activeDocuments.map((document) => (
                <DocumentRow key={document.id} document={document} now={now} />
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="dashboard-footer">
        <span className="footer-mark" aria-hidden="true">
          <AlertCircle size={14} />
        </span>
        <span>
          Demo workspace with synthetic accounts. Explicit saves, revision checks,
          and SQLite persistence.
        </span>
      </footer>
    </div>
  );
}
