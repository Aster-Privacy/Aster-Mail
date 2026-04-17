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
import type {
  ShortcutModifier,
  ShortcutActionId,
} from "@/constants/keyboard_shortcuts";

import { useState, useEffect, useMemo } from "react";

import { get_shortcut_for_action } from "@/constants/keyboard_shortcuts";
import { cn, is_mac_platform } from "@/lib/utils";

type BadgeSize = "xs" | "sm" | "md" | "lg";

interface KeyboardShortcutBadgeProps {
  shortcut?: string;
  action_id?: ShortcutActionId;
  modifier?: ShortcutModifier;
  size?: BadgeSize;
  variant?: "default" | "outline" | "ghost";
  show_on_touch?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: "min-w-[14px] h-[14px] px-0.5 text-[8px]",
  sm: "min-w-[18px] h-[18px] px-1 text-[10px]",
  md: "min-w-[22px] h-[22px] px-1.5 text-[11px]",
  lg: "min-w-[28px] h-[28px] px-2 text-[13px]",
};

export function KeyboardShortcutBadge({
  shortcut,
  action_id,
  modifier,
  size = "sm",
  variant = "default",
  show_on_touch = false,
  className,
}: KeyboardShortcutBadgeProps) {
  const [is_mac, set_is_mac] = useState(false);
  const [is_touch, set_is_touch] = useState(false);

  useEffect(() => {
    set_is_mac(is_mac_platform());
    set_is_touch(
      "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches),
    );
  }, []);

  const resolved_shortcut = useMemo(() => {
    if (shortcut) return { key: shortcut, modifier };
    if (action_id) {
      const definition = get_shortcut_for_action(action_id);

      return definition
        ? { key: definition.key, modifier: definition.modifier }
        : null;
    }

    return null;
  }, [shortcut, action_id, modifier]);

  const format_modifier = (mod: ShortcutModifier): string => {
    if (is_mac) {
      if (mod === "cmd+shift" || mod === "ctrl+shift") return "\u2318\u21E7";
      if (mod === "cmd" || mod === "ctrl") return "\u2318";
      if (mod === "shift") return "\u21E7";
      if (mod === "alt") return "\u2325";
    } else {
      if (mod === "cmd+shift" || mod === "ctrl+shift") return "Ctrl+Shift";
      if (mod === "cmd" || mod === "ctrl") return "Ctrl";
      if (mod === "shift") return "Shift";
      if (mod === "alt") return "Alt";
    }

    return mod;
  };

  const format_key = (key: string): string => {
    if (key === "Enter") return "\u21B5";
    if (key === "Escape") return "Esc";
    if (key === "Backspace") return "\u232B";
    if (key === "Tab") return "\u21E5";
    if (key === "ArrowUp") return "\u2191";
    if (key === "ArrowDown") return "\u2193";
    if (key === "ArrowLeft") return "\u2190";
    if (key === "ArrowRight") return "\u2192";
    if (key === " ") return "Space";

    return key.toUpperCase();
  };

  if (!resolved_shortcut) return null;
  if (is_touch && !show_on_touch) return null;

  const variant_classes = {
    default: [
      "bg-surf-tertiary text-txt-muted",
      "border border-edge-secondary",
      "shadow-[0_1px_0_var(--border-secondary)]",
    ].join(" "),
    outline: [
      "bg-transparent text-txt-muted",
      "border border-edge-secondary",
    ].join(" "),
    ghost: "bg-transparent text-txt-muted",
  };

  return (
    <kbd
      aria-label={`Keyboard shortcut: ${resolved_shortcut.modifier ? format_modifier(resolved_shortcut.modifier) + " + " : ""}${format_key(resolved_shortcut.key)}`}
      className={cn(
        "inline-flex items-center justify-center gap-0.5 rounded font-mono font-medium select-none",
        variant_classes[variant],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {resolved_shortcut.modifier && (
        <span aria-hidden="true">
          {format_modifier(resolved_shortcut.modifier)}
        </span>
      )}
      <span aria-hidden="true">{format_key(resolved_shortcut.key)}</span>
    </kbd>
  );
}

export type { BadgeSize, KeyboardShortcutBadgeProps };
