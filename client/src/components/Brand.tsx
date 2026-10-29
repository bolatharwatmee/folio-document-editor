import type { CSSProperties } from "react";
import { FileText } from "lucide-react";
import { initials } from "../utils";

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="16" fill="#0f766e" />
      <path
        d="M20 16h17l9 9v23a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4Z"
        fill="#fffdf7"
      />
      <path
        d="M37 16v9h9"
        fill="none"
        stroke="#0f766e"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M24 33h16M24 40h16M24 47h10"
        stroke="#0f766e"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand${compact ? " brand-compact" : ""}`}>
      <LogoMark size={compact ? 30 : 38} />
      <span className="brand-text">
        <span className="brand-name">Folio</span>
        {!compact && <span className="brand-tagline">A calm place to write</span>}
      </span>
    </span>
  );
}

export function Avatar({
  name,
  color,
  size = "md",
  className = "",
}: {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={`avatar avatar-${size} ${className}`.trim()}
      style={{ "--avatar-color": color } as CSSProperties}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function DocumentGlyph() {
  return (
    <span className="document-glyph" aria-hidden="true">
      <FileText size={20} strokeWidth={1.8} />
    </span>
  );
}
