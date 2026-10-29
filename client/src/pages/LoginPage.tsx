import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Lock,
  PencilLine,
  Share2,
  Sparkles,
} from "lucide-react";
import { ApiError } from "../api";
import { useApp } from "../context/AppContext";
import type { DemoUser } from "../types";
import { Banner } from "../components/Banner";
import { Avatar, Brand, Spinner } from "../components/Brand";

function accountDescription(user: DemoUser): string {
  if (user.id === "usr_alice") {
    return "Owns the welcome document and manages who can access it.";
  }
  if (user.id === "usr_bob") {
    return "Receives shared documents and can edit them.";
  }
  if (user.id === "usr_carol") {
    return "Has no access to the shared documents — useful for access checks.";
  }
  return user.roleLabel;
}

export function LoginPage() {
  const { user, demoUsers, signIn } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from !== "/login"
      ? (location.state as { from: string }).from
      : "/";

  if (user) {
    return <Navigate to={from} replace />;
  }

  const handleSignIn = async (userId: string) => {
    setPendingId(userId);
    setError(null);
    try {
      await signIn(userId);
      navigate(from, { replace: true });
    } catch (signInError) {
      setError(
        signInError instanceof ApiError
          ? signInError.message
          : "Could not open the demo workspace.",
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="login-hero-inner">
          <Brand />
          <div className="login-hero-copy">
            <span className="eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              A small collaborative editor
            </span>
            <h1>
              Write something
              <br />
              worth sharing.
            </h1>
            <p className="login-lede">
              Folio keeps the useful part of a document editor: rich text that
              survives saving, clear ownership, and sharing that is enforced by
              the server.
            </p>
          </div>

          <ul className="login-features">
            <li>
              <PencilLine size={18} aria-hidden="true" />
              <span>
                <strong>Formatting that persists</strong>
                Bold, italic, underline, headings, and lists.
              </span>
            </li>
            <li>
              <Share2 size={18} aria-hidden="true" />
              <span>
                <strong>Owner-controlled sharing</strong>
                Share with a recipient; only the owner changes access.
              </span>
            </li>
            <li>
              <Lock size={18} aria-hidden="true" />
              <span>
                <strong>Real server checks</strong>
                Lists and document reads are filtered on the server.
              </span>
            </li>
          </ul>

          <p className="login-hero-footnote">
            Built as a focused full-stack exercise. No real accounts, secrets, or
            production data are used.
          </p>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="eyebrow">Demo access</span>
            <h2>Choose an account</h2>
            <p className="muted">
              No password. Pick one of the seeded users to explore ownership and
              sharing.
            </p>
          </div>

          {error && (
            <Banner tone="error" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          )}

          <div className="account-list">
            {demoUsers.map((demoUser) => (
              <button
                key={demoUser.id}
                type="button"
                className="account-choice"
                disabled={pendingId !== null}
                onClick={() => void handleSignIn(demoUser.id)}
              >
                <Avatar name={demoUser.name} color={demoUser.color} size="lg" />
                <span className="account-choice-copy">
                  <span className="account-choice-topline">
                    <strong>{demoUser.name}</strong>
                    <span className="role-pill">{demoUser.roleLabel}</span>
                  </span>
                  <span className="account-choice-email">{demoUser.email}</span>
                  <span className="account-choice-description">
                    {accountDescription(demoUser)}
                  </span>
                </span>
                <span className="account-choice-action" aria-hidden="true">
                  {pendingId === demoUser.id ? (
                    <Spinner label="Signing in" />
                  ) : (
                    <ArrowRight size={18} />
                  )}
                </span>
              </button>
            ))}
          </div>

          {demoUsers.length === 0 && (
            <Banner tone="warning" title="No demo accounts found">
              Run the seed command or restart the server to create the demo
              accounts.
            </Banner>
          )}

          <div className="login-card-footer">
            <Lock size={14} aria-hidden="true" />
            <span>
              Demo identity selector. Anyone with this URL can choose an account;
              this is not production authentication.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
