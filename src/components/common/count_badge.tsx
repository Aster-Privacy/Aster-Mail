interface CountBadgeProps {
  count: number | undefined | null;
  max_display?: number;
  show_zero?: boolean;
  is_active?: boolean;
  className?: string;
}

export function CountBadge({
  count,
  max_display = 99,
  show_zero = false,
  is_active = false,
  className = "",
}: CountBadgeProps) {
  const safe_count = typeof count === "number" && Number.isFinite(count) ? count : 0;

  if (safe_count === 0 && !show_zero) {
    return null;
  }

  const display_value =
    safe_count > max_display ? `${max_display}+` : safe_count.toString();

  return (
    <span
      className={`text-[12px] font-medium tabular-nums ${className}`}
      style={{ color: is_active ? "var(--text-secondary)" : "var(--text-muted)" }}
    >
      {display_value}
    </span>
  );
}
