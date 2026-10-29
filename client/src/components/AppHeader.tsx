import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, RefreshCw } from "lucide-react";
import { useApp } from "../context/AppContext";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";
import { ApiError } from "../api";
import { Avatar, LogoMark } from "./Brand";
import { Spinner } from "./Brand";

export function AppHeader() {
  const { user, demoUsers, signIn, signOut } = useApp();
  const { dirty, setDirty } = useUnsavedChanges();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (!user) {
    return null;
  }

  const confirmDiscard = (message: string): boolean => {
    if (!dirty) {
      return true;
    }
    const confirmed = window.confirm(message);
    if (confirmed) {
      setDirty(false);
    }
    return confirmed;
  };

  const switchUser = async (userId: string) => {
    if (userId === user.id || busyUserId) {
      return;
    }
    if (
      !confirmDiscard(
        "You have unsaved changes. Switch accounts and discard those changes?",
      )
    ) {
      return;
    }

    setBusyUserId(userId);
    setMenuError(null);
    try {
      await signIn(userId);
      navigate("/");
    } catch (error) {
      setMenuError(
        error instanceof ApiError ? error.message : "Could not switch accounts.",
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSignOut = async () => {
    if (
      !confirmDiscard("You have unsaved changes. Sign out and discard those changes?")
    ) {
      return;
    }
    setBusyUserId("signout");
    setMenuError(null);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch {
      setMenuError("Could not sign out. Try again.");
    } finally {
      setBusyUserId(null);
    }
  };

  const otherUsers = demoUsers.filter((demoUser) => demoUser.id !== user.id);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/" className="app-brand" aria-label="Folio home">
          <LogoMark size={32} />
          <span className="app-brand-name">Folio</span>
        </Link>

        <Link to="/" className="header-nav-link">
          All documents
        </Link>

        <div className="header-account" ref={menuRef}>
          <button
            type="button"
            className="account-button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((open) => !open);
              setMenuError(null);
            }}
          >
            <Avatar name={user.name} color={user.color} size="sm" />
            <span className="account-name">{user.name}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>

          {menuOpen && (
            <div className="account-menu" role="menu" aria-label="Demo account">
              <div className="account-menu-heading">
                <span className="eyebrow">Signed in as</span>
                <strong>{user.name}</strong>
                <span className="muted small">{user.email}</span>
              </div>
              <div className="account-menu-note">
                Demo identity selector. This is not production authentication.
              </div>

              {menuError && (
                <div className="account-menu-error" role="alert">
                  {menuError}
                </div>
              )}

              {otherUsers.length > 0 && (
                <div className="account-menu-section">
                  <span className="account-menu-label">Switch demo account</span>
                  {otherUsers.map((demoUser) => (
                    <button
                      key={demoUser.id}
                      type="button"
                      role="menuitem"
                      className="account-menu-item"
                      disabled={busyUserId !== null}
                      onClick={() => void switchUser(demoUser.id)}
                    >
                      <Avatar
                        name={demoUser.name}
                        color={demoUser.color}
                        size="sm"
                      />
                      <span className="account-menu-item-text">
                        <span>{demoUser.name}</span>
                        <span className="muted small">{demoUser.roleLabel}</span>
                      </span>
                      {busyUserId === demoUser.id ? (
                        <Spinner label="Switching account" />
                      ) : (
                        <RefreshCw size={14} aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                role="menuitem"
                className="account-menu-item account-menu-signout"
                disabled={busyUserId !== null}
                onClick={() => void handleSignOut()}
              >
                <LogOut size={16} aria-hidden="true" />
                <span>Sign out</span>
                {busyUserId === "signout" && <Spinner label="Signing out" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
