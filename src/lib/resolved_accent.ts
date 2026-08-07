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
import { useSyncExternalStore } from "react";

import { css_color_to_hex } from "@/lib/avatar_color";
import { contrast_ratio, LARGE_TEXT_CONTRAST } from "@/lib/email_ink";

export const DEFAULT_ACCENT_COLOR = "#3b82f6";
export const DEFAULT_ACCENT_COLOR_HOVER = "#2563eb";

export type AccentForeground = "#ffffff" | "#111827";

export interface ResolvedAccent {
  accent: string;
  accent_hover: string;
  accent_fg: AccentForeground;
  surface: string;
}

export const DEFAULT_SURFACE_COLOR = "#ffffff";

const LIGHT_FOREGROUND: AccentForeground = "#ffffff";
const DARK_FOREGROUND: AccentForeground = "#111827";

export function accent_foreground_for(accent: string): AccentForeground {
  const hex = css_color_to_hex(accent);

  if (!hex) return LIGHT_FOREGROUND;

  return contrast_ratio(hex, LIGHT_FOREGROUND) < LARGE_TEXT_CONTRAST
    ? DARK_FOREGROUND
    : LIGHT_FOREGROUND;
}

let current: ResolvedAccent = {
  accent: DEFAULT_ACCENT_COLOR,
  accent_hover: DEFAULT_ACCENT_COLOR_HOVER,
  accent_fg: accent_foreground_for(DEFAULT_ACCENT_COLOR),
  surface: DEFAULT_SURFACE_COLOR,
};

let initialized = false;

const listeners = new Set<() => void>();

function read_color_var(
  styles: CSSStyleDeclaration,
  name: string,
): string | null {
  const value = styles.getPropertyValue(name).trim();

  if (!value) return null;

  return css_color_to_hex(value);
}

export function refresh_resolved_accent(): ResolvedAccent {
  if (typeof document === "undefined") return current;

  initialized = true;

  const styles = getComputedStyle(document.documentElement);
  const accent = read_color_var(styles, "--accent-color") ?? DEFAULT_ACCENT_COLOR;
  const accent_hover = read_color_var(styles, "--accent-color-hover") ?? accent;
  const next: ResolvedAccent = {
    accent,
    accent_hover,
    accent_fg: accent_foreground_for(accent),
    surface: read_color_var(styles, "--bg-primary") ?? DEFAULT_SURFACE_COLOR,
  };

  if (
    next.accent === current.accent &&
    next.accent_hover === current.accent_hover &&
    next.accent_fg === current.accent_fg &&
    next.surface === current.surface
  ) {
    return current;
  }

  current = next;

  for (const listener of listeners) listener();

  return current;
}

export function get_resolved_accent(): ResolvedAccent {
  if (!initialized) refresh_resolved_accent();

  return current;
}

function subscribe_resolved_accent(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function use_resolved_accent(): ResolvedAccent {
  return useSyncExternalStore(
    subscribe_resolved_accent,
    get_resolved_accent,
    get_resolved_accent,
  );
}
