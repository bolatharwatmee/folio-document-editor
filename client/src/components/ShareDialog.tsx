import { useEffect, useMemo, useState } from "react";
import { Check, Link2, Lock, Share2, UserPlus, X } from "lucide-react";
import { api, ApiError } from "../api";
import type { DemoUser, ShareEntry } from "../types";
import { formatDateTime } from "../utils";
import { Avatar, Spinner } from "./Brand";
import { Banner } from "./Banner";
import { Modal } from "./Modal";

export function ShareDialog({
  open,
  onClose,
  documentId,
  documentTitle,
  owner,
  shares,
  demoUsers,
  onSharesChange,
}: {
  open: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  owner: DemoUser;
  shares: ShareEntry[];
  demoUsers: DemoUser[];
  onSharesChange: (shares: ShareEntry[]) => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<"editor" | "viewer">("editor");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const url = `${window.location.origin}/documents/${documentId}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("No clipboard API");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sharedIds = useMemo(
    () => new Set(shares.map((share) => share.user.id)),
    [shares],
  );
  const availableUsers = useMemo(
    () =>
      demoUsers.filter(
        (demoUser) => demoUser.id !== owner.id && !sharedIds.has(demoUser.id),
      ),
    [demoUsers, owner.id, sharedIds],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setLoading(true);
    let ignore = false;
    api
      .listShares(documentId)
      .then((result) => {
        if (!ignore) {
          onSharesChange(result.shares);
        }
      })
      .catch((loadError) => {
        if (!ignore) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : "Could not load access.",
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
  }, [open, documentId, onSharesChange]);

  useEffect(() => {
    const currentIsAvailable = availableUsers.some(
      (demoUser) => demoUser.id === selectedUserId,
    );
    if (!currentIsAvailable) {
      setSelectedUserId(availableUsers[0]?.id ?? "");
    }
  }, [availableUsers, selectedUserId]);

  const addShare = async () => {
    if (!selectedUserId || busy) {
      return;
    }
    setBusy(selectedUserId);
    setError(null);
    try {
      const result = await api.addShare(documentId, selectedUserId, selectedRole);
      onSharesChange(result.shares);
    } catch (shareError) {
      setError(
        shareError instanceof ApiError
          ? shareError.message
          : "Could not add access.",
      );
    } finally {
      setBusy(null);
    }
  };

  const updateRole = async (userId: string, role: "editor" | "viewer") => {
    if (busy) {
      return;
    }
    setBusy(userId);
    setError(null);
    try {
      const result = await api.addShare(documentId, userId, role);
      onSharesChange(result.shares);
    } catch (shareError) {
      setError(
        shareError instanceof ApiError
          ? shareError.message
          : "Could not update permission.",
      );
    } finally {
      setBusy(null);
    }
  };

  const removeShare = async (userId: string) => {
    if (busy) {
      return;
    }
    setBusy(userId);
    setError(null);
    try {
      const result = await api.removeShare(documentId, userId);
      onSharesChange(result.shares);
    } catch (shareError) {
      setError(
        shareError instanceof ApiError
          ? shareError.message
          : "Could not remove access.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="share-dialog-title">
      <div className="modal-header">
        <div>
          <span className="eyebrow">
            <Share2 size={14} aria-hidden="true" />
            Sharing
          </span>
          <h2 id="share-dialog-title">Share “{documentTitle}”</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close sharing dialog"
        >
          <X size={18} />
        </button>
      </div>

      <p className="modal-description">
        People with access can open and edit this document. Only the owner can
        invite or remove people.
      </p>

      {error && (
        <Banner tone="error" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      )}

      <div className="share-section">
        <h3>People with access</h3>
        <ul className="share-list">
          <li className="share-row">
            <Avatar name={owner.name} color={owner.color} size="md" />
            <span className="share-row-text">
              <span className="share-row-name">
                {owner.name} <span className="owner-pill">Owner</span>
              </span>
              <span className="muted small">{owner.email}</span>
            </span>
            <span className="share-role">Full access</span>
          </li>

          {shares.map((share) => (
            <li className="share-row" key={share.user.id}>
              <Avatar
                name={share.user.name}
                color={share.user.color}
                size="md"
              />
              <span className="share-row-text">
                <span className="share-row-name">{share.user.name}</span>
                <span className="muted small">
                  {share.user.email} · added {formatDateTime(share.sharedAt)}
                </span>
              </span>
              <select
                className="select select-compact"
                value={share.role}
                onChange={(event) =>
                  void updateRole(
                    share.user.id,
                    event.target.value as "editor" | "viewer",
                  )
                }
                disabled={busy !== null}
                aria-label={`Role for ${share.user.name}`}
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button
                type="button"
                className="text-button danger-text"
                onClick={() => void removeShare(share.user.id)}
                disabled={busy !== null}
              >
                {busy === share.user.id ? <Spinner label="Removing access" /> : "Remove"}
              </button>
            </li>
          ))}

          {shares.length === 0 && !loading && (
            <li className="share-empty">
              Only you have access right now. Add a demo user below.
            </li>
          )}
          {loading && (
            <li className="share-empty">
              <Spinner label="Loading access list" /> Checking access…
            </li>
          )}
        </ul>
      </div>

      <div className="share-section">
        <h3>Give another demo user access</h3>
        {availableUsers.length > 0 ? (
          <div className="share-add-row">
            <label className="visually-hidden" htmlFor="share-user-select">
              Demo user
            </label>
            <select
              id="share-user-select"
              className="select"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              disabled={busy !== null}
            >
              {availableUsers.map((demoUser) => (
                <option value={demoUser.id} key={demoUser.id}>
                  {demoUser.name} — {demoUser.roleLabel}
                </option>
              ))}
            </select>
            <label className="visually-hidden" htmlFor="share-role-select">
              Permission
            </label>
            <select
              id="share-role-select"
              className="select select-compact"
              value={selectedRole}
              onChange={(event) =>
                setSelectedRole(event.target.value as "editor" | "viewer")
              }
              disabled={busy !== null}
            >
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void addShare()}
              disabled={!selectedUserId || busy !== null}
            >
              {busy === selectedUserId ? (
                <Spinner label="Adding access" />
              ) : (
                <UserPlus size={16} />
              )}
              Add
            </button>
          </div>
        ) : (
          <p className="muted small">
            Everyone in the demo workspace already has access.
          </p>
        )}
      </div>

      <div className="share-link-banner">
        <div className="share-link-details">
          <Link2 size={16} className="share-link-icon" />
          <div>
            <div className="share-link-title">Share via direct link</div>
            <div className="muted small">Anyone with access can use this link to open the document</div>
          </div>
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void copyLink()}
          aria-label="Copy document link"
        >
          {copied ? <Check size={15} /> : <Link2 size={15} />}
          {copied ? "Link copied!" : "Copy link"}
        </button>
      </div>

      <div className="modal-note">
        <Lock size={15} aria-hidden="true" />
        <span>
          Demo identity selector: anyone with this URL can impersonate these
          synthetic accounts. Production would use real authentication.
        </span>
      </div>

      <div className="modal-footer">
        <button type="button" className="button button-secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
