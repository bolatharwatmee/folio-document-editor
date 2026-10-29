import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate } from "react-router-dom";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  ArrowLeft,
  Clock,
  Download,
  Eye,
  FilePlus2,
  FileText,
  Lock,
  Printer,
  RefreshCw,
  Save,
  Share2,
  Users,
} from "lucide-react";
import { api, ApiError } from "../api";
import { useApp } from "../context/AppContext";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";
import type {
  DocumentDetail,
  RichTextDoc,
  ShareEntry,
} from "../types";
import {
  formatDateTime,
  formatRelativeTime,
  MAX_TITLE_LENGTH,
} from "../utils";
import { exportDocument } from "../export";
import { useNow } from "../hooks/useNow";
import { Avatar, Spinner } from "./Brand";
import { Banner } from "./Banner";
import { ConfirmDialog } from "./ConfirmDialog";
import { EditorToolbar } from "./EditorToolbar";
import { ShareDialog } from "./ShareDialog";

type SaveState = "saved" | "dirty" | "error" | "conflict";

interface StoredDraft {
  title: string;
  content: RichTextDoc;
  baseRevision: number;
  savedAt: string;
}

const DRAFT_DEBOUNCE_MS = 300;

function draftKeyFor(documentId: string): string {
  return `folio:draft:${documentId}`;
}

function copyTitle(base: string): string {
  const suffix = " (my copy)";
  return `${base.slice(0, MAX_TITLE_LENGTH - suffix.length).trim()}${suffix}`;
}

export function DocumentEditor({
  initialDocument,
}: {
  initialDocument: DocumentDetail;
}) {
  const { user, demoUsers, signOut } = useApp();
  const { dirty: globalDirty, setDirty: setGlobalDirty } = useUnsavedChanges();
  const navigate = useNavigate();
  const now = useNow();
  const draftKey = draftKeyFor(initialDocument.id);

  const [title, setTitle] = useState(initialDocument.title);
  const [revision, setRevision] = useState(initialDocument.revision);
  const [shares, setShares] = useState<ShareEntry[]>(
    initialDocument.shares ?? [],
  );
  const [lastSavedAt, setLastSavedAt] = useState(initialDocument.updatedAt);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictDoc, setConflictDoc] = useState<DocumentDetail | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [draftNotice, setDraftNotice] = useState<StoredDraft | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [editTick, setEditTick] = useState(0);

  const canEdit = !accessLost && initialDocument.canEdit;

  const changeVersionRef = useRef(0);
  const savingRef = useRef(false);

  const markDirty = useCallback(() => {
    if (!initialDocument.canEdit) {
      return;
    }
    changeVersionRef.current += 1;
    setEditTick((tick) => tick + 1);
    setDirty(true);
    setGlobalDirty(true);
    setSaveState((previous) => (previous === "conflict" ? previous : "dirty"));
  }, [setGlobalDirty, initialDocument.canEdit]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          blockquote: false,
          code: false,
          codeBlock: false,
          horizontalRule: false,
          link: false,
          strike: false,
          heading: { levels: [1, 2, 3] },
        }),
      ],
      content: initialDocument.content as unknown as JSONContent,
      editorProps: {
        attributes: {
          class: "tiptap",
          "aria-label": "Document content",
          role: "textbox",
          "aria-multiline": "true",
          spellcheck: "true",
        },
      },
      onUpdate: () => markDirty(),
    },
    [],
  );

  const removeDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Local storage may be unavailable; the editor still keeps the draft in memory.
    }
  }, [draftKey]);

  useEffect(() => {
    document.title = `${title.trim() || "Untitled document"} — Folio`;
  }, [title]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(canEdit);
  }, [editor, canEdit]);

  useEffect(() => {
    setGlobalDirty(dirty);
    return () => setGlobalDirty(false);
  }, [dirty, setGlobalDirty]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) {
        return;
      }
      const stored = JSON.parse(raw) as StoredDraft;
      if (
        !stored ||
        typeof stored.title !== "string" ||
        !stored.content ||
        stored.content.type !== "doc" ||
        typeof stored.savedAt !== "string"
      ) {
        window.localStorage.removeItem(draftKey);
        return;
      }

      const contentDiffers =
        JSON.stringify(stored.content) !== JSON.stringify(initialDocument.content);
      const titleDiffers = stored.title !== initialDocument.title;
      if (contentDiffers || titleDiffers) {
        setDraftNotice(stored);
      } else {
        window.localStorage.removeItem(draftKey);
      }
    } catch {
      // Ignore malformed or inaccessible local drafts.
    }
  }, [draftKey, initialDocument.content, initialDocument.title]);

  useEffect(() => {
    if (!dirty || !editor) {
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        const draft: StoredDraft = {
          title,
          content: editor.getJSON() as unknown as RichTextDoc,
          baseRevision: revision,
          savedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        // Local storage is a best-effort recovery aid, not the source of truth.
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, editor, title, revision, draftKey, editTick]);

  const save = useCallback(async () => {
    if (
      !editor ||
      savingRef.current ||
      conflictDoc ||
      accessLost ||
      !dirty
    ) {
      return;
    }

    const versionAtStart = changeVersionRef.current;
    const contentSnapshot = editor.getJSON() as unknown as RichTextDoc;
    const titleSnapshot = title.trim() || "Untitled document";
    if (titleSnapshot !== title) {
      setTitle(titleSnapshot);
    }

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setCopyError(null);

    try {
      const result = await api.updateDocument(initialDocument.id, {
        title: titleSnapshot,
        content: contentSnapshot,
        baseRevision: revision,
      });

      setRevision(result.document.revision);
      setTitle(result.document.title);
      if (result.document.shares) {
        setShares(result.document.shares);
      }
      setLastSavedAt(result.document.updatedAt);

      if (changeVersionRef.current === versionAtStart) {
        setDirty(false);
        setGlobalDirty(false);
        setSaveState("saved");
        removeDraft();
      } else {
        setDirty(true);
        setGlobalDirty(true);
        setSaveState("dirty");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        navigate("/login", { replace: true });
        return;
      }

      if (error instanceof ApiError && error.status === 409) {
        const details = error.details as { document?: DocumentDetail } | undefined;
        if (details?.document) {
          setConflictDoc(details.document);
        }
        setSaveState("conflict");
      } else if (error instanceof ApiError && error.status === 404) {
        setAccessLost(true);
        setSaveState("error");
        setSaveError("This document is no longer available to your account.");
      } else {
        setSaveState("error");
        setSaveError(
          error instanceof ApiError
            ? error.message
            : "Save failed. Your changes are still in this editor.",
        );
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [
    editor,
    conflictDoc,
    accessLost,
    dirty,
    title,
    initialDocument.id,
    revision,
    setGlobalDirty,
    removeDraft,
    signOut,
    navigate,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [save]);

  const blocker = useBlocker(globalDirty);

  const retireDraft = () => {
    removeDraft();
    setDraftNotice(null);
  };

  const restoreDraft = () => {
    if (!editor || !draftNotice) {
      return;
    }
    editor.commands.setContent(
      draftNotice.content as unknown as JSONContent,
      { emitUpdate: false },
    );
    setTitle(draftNotice.title.slice(0, MAX_TITLE_LENGTH));
    changeVersionRef.current += 1;
    setEditTick((tick) => tick + 1);
    setDirty(true);
    setGlobalDirty(true);
    setSaveState("dirty");
    setDraftNotice(null);
  };

  const saveAsCopy = async () => {
    if (!editor || copyBusy) {
      return;
    }
    setCopyBusy(true);
    setCopyError(null);
    try {
      const result = await api.createDocument({
        title: copyTitle(title.trim() || conflictDoc?.title || "Untitled document"),
        content: editor.getJSON() as unknown as RichTextDoc,
      });
      removeDraft();
      setDirty(false);
      setGlobalDirty(false);
      navigate(`/documents/${result.document.id}`);
    } catch (error) {
      setCopyError(
        error instanceof ApiError
          ? error.message
          : "Could not save a copy of your changes.",
      );
    } finally {
      setCopyBusy(false);
    }
  };

  const reloadLatest = () => {
    if (!editor || !conflictDoc) {
      return;
    }
    const confirmed = window.confirm(
      "Reload the latest version? The unsaved changes in this editor will be discarded.",
    );
    if (!confirmed) {
      return;
    }

    editor.commands.setContent(
      conflictDoc.content as unknown as JSONContent,
      { emitUpdate: false },
    );
    setTitle(conflictDoc.title);
    setRevision(conflictDoc.revision);
    if (conflictDoc.shares) {
      setShares(conflictDoc.shares);
    }
    setLastSavedAt(conflictDoc.updatedAt);
    setConflictDoc(null);
    setSaveError(null);
    setDirty(false);
    setGlobalDirty(false);
    setSaveState("saved");
    removeDraft();
    changeVersionRef.current += 1;
    setEditTick((tick) => tick + 1);
  };

  const statusLabel = accessLost
    ? "Access lost"
    : saving
      ? "Saving…"
      : conflictDoc
        ? "Update conflict"
        : saveState === "error"
          ? "Save failed"
          : dirty
            ? "Unsaved changes"
            : "Saved";

  const statusTone = accessLost
    ? "danger"
    : saving
      ? "saving"
      : conflictDoc
        ? "warning"
        : saveState === "error"
          ? "danger"
          : dirty
            ? "warning"
            : "saved";

  const handleConfirmLeave = () => {
    setDirty(false);
    setGlobalDirty(false);
    removeDraft();
    if (blocker.state === "blocked") {
      blocker.proceed();
    }
  };

  const handleCancelLeave = () => {
    if (blocker.state === "blocked") {
      blocker.reset();
    }
  };

  if (!user) {
    return null;
  }

  const owner = initialDocument.owner;
  const isOwner = initialDocument.access === "owner";

  return (
    <div className="editor-page">
      <div className="editor-topbar">
        <button
          type="button"
          className="icon-text-button back-button"
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={16} />
          <span>All documents</span>
        </button>

        <div className="editor-topbar-actions">
          {!initialDocument.canEdit && (
            <span className="access-badge access-badge-viewer">
              <Eye size={13} aria-hidden="true" />
              View only
            </span>
          )}

          {canEdit && (
            <>
              <span
                className={`save-status save-status-${statusTone}`}
                aria-live="polite"
              >
                <span className="status-dot" aria-hidden="true" />
                {statusLabel}
              </span>

              <button
                type="button"
                className="button button-primary save-button"
                onClick={() => void save()}
                disabled={!dirty || saving || Boolean(conflictDoc) || accessLost}
                title="Save document (Cmd/Ctrl+S)"
              >
                {saving ? <Spinner label="Saving" /> : <Save size={16} />}
                <span>{saving ? "Saving…" : "Save"}</span>
              </button>
            </>
          )}

          <div className="export-dropdown-wrapper">
            <button
              type="button"
              className="button button-secondary export-button"
              onClick={() => setExportOpen((prev) => !prev)}
              title="Export document"
              aria-expanded={exportOpen}
            >
              <Download size={16} />
              <span>Export</span>
            </button>
            {exportOpen && (
              <div className="export-menu" role="menu">
                <button
                  type="button"
                  className="export-menu-item"
                  onClick={() => {
                    if (editor) {
                      exportDocument(
                        editor.getJSON() as unknown as RichTextDoc,
                        title,
                        "md",
                      );
                    }
                    setExportOpen(false);
                  }}
                >
                  <FileText size={15} />
                  <span>Markdown (.md)</span>
                </button>
                <button
                  type="button"
                  className="export-menu-item"
                  onClick={() => {
                    if (editor) {
                      exportDocument(
                        editor.getJSON() as unknown as RichTextDoc,
                        title,
                        "txt",
                      );
                    }
                    setExportOpen(false);
                  }}
                >
                  <FileText size={15} />
                  <span>Plain text (.txt)</span>
                </button>
                <button
                  type="button"
                  className="export-menu-item"
                  onClick={() => {
                    if (editor) {
                      exportDocument(
                        editor.getJSON() as unknown as RichTextDoc,
                        title,
                        "pdf",
                      );
                    }
                    setExportOpen(false);
                  }}
                >
                  <Printer size={15} />
                  <span>Print / Save as PDF</span>
                </button>
              </div>
            )}
          </div>

          {initialDocument.canShare ? (
            <button
              type="button"
              className="button button-secondary share-button"
              onClick={() => setShareOpen(true)}
            >
              <Share2 size={16} />
              <span>Share</span>
            </button>
          ) : (
            <span className="shared-indicator">
              <Users size={15} />
              {initialDocument.canEdit ? "Shared with you" : "View-only access"}
            </span>
          )}
        </div>
      </div>

      <div className="editor-workspace">
        {accessLost && (
          <Banner
            tone="error"
            title="You no longer have access"
            action={
              <Link to="/" className="button button-small button-secondary">
                Back to documents
              </Link>
            }
          >
            This document is no longer available to your account. Your local
            edits are still visible here but cannot be saved.
          </Banner>
        )}

        {conflictDoc && !accessLost && (
          <Banner
            tone="warning"
            title="A newer version was saved"
            action={
              <div className="banner-buttons">
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={() => void saveAsCopy()}
                  disabled={copyBusy}
                >
                  {copyBusy ? <Spinner label="Saving copy" /> : <FilePlus2 size={15} />}
                  Save my changes as a copy
                </button>
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={reloadLatest}
                  disabled={copyBusy}
                >
                  <RefreshCw size={15} />
                  Reload latest
                </button>
              </div>
            }
          >
            <p>
              {conflictDoc.updatedBy.name} saved a newer version{" "}
              {formatRelativeTime(conflictDoc.updatedAt, now)} (revision{" "}
              {conflictDoc.revision}). Your edits are preserved in this editor.
              Save them as a copy or reload the latest version.
            </p>
            {copyError && <p className="banner-inline-error">{copyError}</p>}
          </Banner>
        )}

        {saveState === "error" && saveError && !accessLost && !conflictDoc && (
          <Banner
            tone="error"
            title="Save failed"
            action={
              <button
                type="button"
                className="button button-small button-secondary"
                onClick={() => void save()}
                disabled={saving}
              >
                <RefreshCw size={15} />
                Retry save
              </button>
            }
          >
            {saveError} Your content is still in this editor and the local draft
            is kept.
          </Banner>
        )}

        {draftNotice && !accessLost && (
          <Banner
            tone={draftNotice.baseRevision === revision ? "info" : "warning"}
            title="Unsaved draft found"
            action={
              <div className="banner-buttons">
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={restoreDraft}
                >
                  Restore draft
                </button>
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={retireDraft}
                >
                  Discard draft
                </button>
              </div>
            }
          >
            A local draft from {formatDateTime(draftNotice.savedAt)} was found.
            {draftNotice.baseRevision !== revision
              ? " It is based on an older version; review it carefully before saving."
              : " Restore it to continue where you left off."}
          </Banner>
        )}

        {initialDocument.access === "shared" && (
          <div className="shared-note">
            {initialDocument.canEdit ? (
              <>
                <Users size={15} aria-hidden="true" />
                <span>
                  Shared with you by {owner.name}. You can edit this document; only
                  the owner can manage access.
                </span>
              </>
            ) : (
              <>
                <Eye size={15} aria-hidden="true" />
                <span>
                  Shared with you by {owner.name} as view-only. You cannot edit this document.
                </span>
              </>
            )}
          </div>
        )}

        {canEdit ? (
          <div className="editor-toolbar-sticky">
            <EditorToolbar editor={editor} />
          </div>
        ) : (
          <div className="editor-toolbar-sticky editor-toolbar-viewonly">
            <Eye size={14} aria-hidden="true" />
            <span>View-only mode · Formatting and editing are disabled</span>
          </div>
        )}

        <div className="editor-paper">
          <input
            className="document-title-input"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              markDirty();
            }}
            onBlur={() => {
              if (!title.trim()) {
                setTitle("Untitled document");
                markDirty();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            aria-label="Document title"
            placeholder="Untitled document"
            maxLength={MAX_TITLE_LENGTH}
            disabled={!canEdit}
          />

          <div className="document-meta">
            <Avatar name={owner.name} color={owner.color} size="sm" />
            <span className="document-owner">
              {isOwner ? "Owned by you" : `Shared by ${owner.name}`}
            </span>
            <span className="meta-divider" aria-hidden="true" />
            <Clock size={13} aria-hidden="true" />
            <span title={formatDateTime(lastSavedAt)}>
              Last saved {formatRelativeTime(lastSavedAt, now)}
            </span>
            {isOwner && shares.length > 0 && (
              <>
                <span className="meta-divider" aria-hidden="true" />
                <Users size={13} aria-hidden="true" />
                <span>
                  Shared with {shares.length}{" "}
                  {shares.length === 1 ? "person" : "people"}
                </span>
              </>
            )}
          </div>

          <div
            className="editor-surface"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                editor.commands.focus("end");
              }
            }}
          >
            <EditorContent editor={editor} />
          </div>

          <div className="document-footnote">
            <span>
              <Lock size={12} aria-hidden="true" /> Stored on the server · explicit
              saves · not real-time collaboration
            </span>
            <span className="kbd-hint">
              <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>S</kbd> to save
            </span>
          </div>
        </div>
      </div>

      {initialDocument.canShare && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          documentId={initialDocument.id}
          documentTitle={title}
          owner={owner}
          shares={shares}
          demoUsers={demoUsers}
          onSharesChange={setShares}
        />
      )}

      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="Leave without saving?"
        description="This document has unsaved changes. If you leave now, those changes will be removed from the editor and the local draft will be discarded."
        confirmLabel="Discard and leave"
        cancelLabel="Keep editing"
        onConfirm={handleConfirmLeave}
        onCancel={handleCancelLeave}
      />
    </div>
  );
}
