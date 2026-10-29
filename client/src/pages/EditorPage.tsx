import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { api, ApiError } from "../api";
import { useApp } from "../context/AppContext";
import type { DocumentDetail } from "../types";
import { DocumentEditor } from "../components/DocumentEditor";
import { Spinner } from "../components/Brand";

interface LoadFailure {
  message: string;
  status: number;
  code: string;
}

export function EditorPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { signOut } = useApp();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!documentId) {
      setFailure({ message: "No document was selected.", status: 404, code: "not_found" });
      setLoading(false);
      return;
    }

    let ignore = false;
    setLoading(true);
    setFailure(null);
    document.title = "Opening document… — Folio";
    api
      .getDocument(documentId)
      .then((result) => {
        if (!ignore) {
          setDoc(result.document);
        }
      })
      .catch((error) => {
        if (!ignore) {
          if (error instanceof ApiError && error.status === 401) {
            void signOut();
            navigate("/login", { replace: true });
            return;
          }
          setFailure({
            message:
              error instanceof ApiError
                ? error.message
                : "The document could not be opened.",
            status: error instanceof ApiError ? error.status : 0,
            code: error instanceof ApiError ? error.code : "request_failed",
          });
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
  }, [documentId, reloadKey, signOut, navigate]);

  if (loading) {
    return (
      <div className="editor-page">
        <div className="editor-loading" aria-busy="true">
          <div className="editor-loading-topbar">
            <Link to="/" className="icon-text-button">
              <ArrowLeft size={16} /> All documents
            </Link>
          </div>
          <div className="editor-loading-paper">
            <span className="skeleton skeleton-line skeleton-loading-title" />
            <span className="skeleton skeleton-line skeleton-loading-meta" />
            <div className="skeleton-heading-group">
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line skeleton-line-short" />
            </div>
            <Spinner label="Opening document" />
          </div>
        </div>
      </div>
    );
  }

  if (failure || !doc) {
    const isMissing = failure?.status === 404;
    return (
      <div className="editor-page">
        <div className="load-error-card">
          <span className="eyebrow">{isMissing ? "Not available" : "Something went wrong"}</span>
          <h1>
            {isMissing ? "This document is not available" : "The document did not load"}
          </h1>
          <p>
            {isMissing
              ? "It may have been removed, or your account may not have access. Access is checked on the server."
              : failure?.message}
          </p>
          <div className="load-error-actions">
            <Link to="/" className="button button-primary">
              <ArrowLeft size={16} />
              Back to documents
            </Link>
            {!isMissing && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                <RefreshCw size={16} />
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DocumentEditor
      key={doc.id}
      initialDocument={doc}
    />
  );
}
