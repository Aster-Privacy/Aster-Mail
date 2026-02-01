interface CountBadgeProps {
  count: number;
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
  if (count === 0 && !show_zero) {
    return null;
  }

  const display_value =
    count > max_display ? `${max_display}+` : count.toString();

  return (
    <span
      className={`text-[12px] font-medium tabular-nums ${className}`}
      style={{ color: is_active ? "var(--text-secondary)" : "var(--text-muted)" }}
    >
      {display_value}
    </span>
  );
}
