export const PROFILE_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#22c55e",
  "#14b8a6",
  "#6b7280",
] as const;

export type ProfileColor = (typeof PROFILE_COLORS)[number];

export function get_random_profile_color(): ProfileColor {
  return PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)];
}
