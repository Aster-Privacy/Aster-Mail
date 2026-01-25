export function format_relative_time(timestamp: string): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);

  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diff_ms = now.getTime() - date.getTime();
  const diff_seconds = Math.floor(diff_ms / 1000);
  const diff_minutes = Math.floor(diff_seconds / 60);
  const diff_hours = Math.floor(diff_minutes / 60);
  const diff_days = Math.floor(diff_hours / 24);
  const diff_weeks = Math.floor(diff_days / 7);
  const diff_months = Math.floor(diff_days / 30);

  if (diff_seconds < 60) {
    return "Just now";
  }
  if (diff_minutes < 60) {
    return `${diff_minutes} minute${diff_minutes === 1 ? "" : "s"} ago`;
  }
  if (diff_hours < 24) {
    return `${diff_hours} hour${diff_hours === 1 ? "" : "s"} ago`;
  }
  if (diff_days < 7) {
    return `${diff_days} day${diff_days === 1 ? "" : "s"} ago`;
  }
  if (diff_weeks < 4) {
    return `${diff_weeks} week${diff_weeks === 1 ? "" : "s"} ago`;
  }
  if (diff_months < 12) {
    return `${diff_months} month${diff_months === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
