//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
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

export function get_default_profile_color(): ProfileColor {
  return PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)];
}

const GRADIENT_CONFIGS: Record<
  string,
  { top_left: string; bottom_right: string }
> = {
  "#3b82f6": { top_left: "#3b82f6", bottom_right: "#312e81" },
  "#8b5cf6": { top_left: "#7c3aed", bottom_right: "#1e3a5f" },
  "#ec4899": { top_left: "#ec4899", bottom_right: "#581c87" },
  "#ef4444": { top_left: "#d97706", bottom_right: "#7f1d1d" },
  "#f97316": { top_left: "#eab308", bottom_right: "#78350f" },
  "#22c55e": { top_left: "#4ade80", bottom_right: "#064e3b" },
  "#14b8a6": { top_left: "#2dd4bf", bottom_right: "#134e4a" },
  "#6b7280": { top_left: "#9ca3af", bottom_right: "#111827" },
};

export function get_gradient_background(color: string): string {
  const config = GRADIENT_CONFIGS[color] || {
    top_left: color,
    bottom_right: color,
  };

  return `linear-gradient(135deg, ${config.top_left} 0%, ${config.bottom_right} 100%)`;
}
