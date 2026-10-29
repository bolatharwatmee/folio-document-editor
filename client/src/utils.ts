export const MAX_TITLE_LENGTH = 120;
export const MAX_IMPORT_BYTES = 200 * 1024;
export const MAX_IMPORT_LABEL = "200 KB";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) {
    return "unknown";
  }
  const seconds = Math.round((timestamp - now) / 1000);
  const absolute = Math.abs(seconds);

  if (absolute < 45) {
    return "just now";
  }
  if (absolute < 60 * 60) {
    const minutes = Math.round(seconds / 60);
    return `${Math.abs(minutes)} min ago`;
  }
  if (absolute < 24 * 60 * 60) {
    const hours = Math.round(seconds / 3600);
    return `${Math.abs(hours)} hr ago`;
  }
  if (absolute < 48 * 60 * 60) {
    return seconds < 0 ? "yesterday" : "tomorrow";
  }
  const days = Math.round(seconds / (24 * 60 * 60));
  if (absolute < 7 * 24 * 60 * 60) {
    return `${Math.abs(days)} days ago`;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(iso).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
