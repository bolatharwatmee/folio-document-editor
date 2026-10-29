import { AlertCircle, Check, Info, X } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "error" | "warning" | "success" | "info";

const ICONS = {
  error: AlertCircle,
  warning: AlertCircle,
  success: Check,
  info: Info,
};

export function Banner({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
}) {
  const Icon = ICONS[tone];
  return (
    <div className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" className="banner-icon" />
      <div className="banner-content">
        {title && <strong className="banner-title">{title}</strong>}
        <div className="banner-body">{children}</div>
      </div>
      {action && <div className="banner-action">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          className="icon-button banner-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
