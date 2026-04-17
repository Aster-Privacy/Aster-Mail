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
export type ShortcutModifier =
  | "cmd"
  | "ctrl"
  | "shift"
  | "alt"
  | "cmd+shift"
  | "ctrl+shift";
export type ShortcutCategory = "navigation" | "actions" | "compose" | "global";

export type ShortcutActionId =
  | "next_email"
  | "prev_email"
  | "open_email"
  | "close_viewer"
  | "archive"
  | "delete"
  | "spam"
  | "toggle_star"
  | "mark_read"
  | "mark_unread"
  | "compose"
  | "reply"
  | "reply_all"
  | "forward"
  | "search"
  | "command_palette"
  | "show_shortcuts";

export interface ShortcutDefinition {
  key: string;
  modifier?: ShortcutModifier;
  description: string;
  category: ShortcutCategory;
  action_id: ShortcutActionId;
}

export const KEYBOARD_SHORTCUTS: ShortcutDefinition[] = [
  {
    key: "j",
    description: "Next email",
    category: "navigation",
    action_id: "next_email",
  },
  {
    key: "k",
    description: "Previous email",
    category: "navigation",
    action_id: "prev_email",
  },
  {
    key: "Enter",
    description: "Open email",
    category: "navigation",
    action_id: "open_email",
  },
  {
    key: "o",
    description: "Open email",
    category: "navigation",
    action_id: "open_email",
  },
  {
    key: "Escape",
    description: "Close / back to list",
    category: "navigation",
    action_id: "close_viewer",
  },
  {
    key: "u",
    description: "Back to list",
    category: "navigation",
    action_id: "close_viewer",
  },

  {
    key: "e",
    description: "Archive",
    category: "actions",
    action_id: "archive",
  },
  {
    key: "#",
    description: "Delete / trash",
    category: "actions",
    action_id: "delete",
  },
  {
    key: "!",
    description: "Mark as spam",
    category: "actions",
    action_id: "spam",
  },
  {
    key: "s",
    description: "Star / unstar",
    category: "actions",
    action_id: "toggle_star",
  },
  {
    key: "i",
    modifier: "shift",
    description: "Mark as read",
    category: "actions",
    action_id: "mark_read",
  },
  {
    key: "u",
    modifier: "shift",
    description: "Mark as unread",
    category: "actions",
    action_id: "mark_unread",
  },

  {
    key: "c",
    description: "Compose new email",
    category: "compose",
    action_id: "compose",
  },
  {
    key: "r",
    description: "Reply",
    category: "compose",
    action_id: "reply",
  },
  {
    key: "a",
    description: "Reply all",
    category: "compose",
    action_id: "reply_all",
  },
  {
    key: "f",
    description: "Forward",
    category: "compose",
    action_id: "forward",
  },

  {
    key: "k",
    modifier: "cmd",
    description: "Search",
    category: "global",
    action_id: "search",
  },
  {
    key: "p",
    modifier: "cmd+shift",
    description: "Command palette",
    category: "global",
    action_id: "command_palette",
  },
  {
    key: "?",
    description: "Show shortcuts",
    category: "global",
    action_id: "show_shortcuts",
  },
];

export function get_shortcut_for_action(
  action_id: string,
): ShortcutDefinition | null {
  return KEYBOARD_SHORTCUTS.find((s) => s.action_id === action_id) ?? null;
}

export function get_all_shortcuts_for_action(
  action_id: string,
): ShortcutDefinition[] {
  return KEYBOARD_SHORTCUTS.filter((s) => s.action_id === action_id);
}

export function get_shortcuts_by_category(
  category: ShortcutCategory,
): ShortcutDefinition[] {
  return KEYBOARD_SHORTCUTS.filter((s) => s.category === category);
}

export function get_unique_shortcuts_by_category(
  category: ShortcutCategory,
): ShortcutDefinition[] {
  const shortcuts = get_shortcuts_by_category(category);
  const seen_actions = new Set<string>();

  return shortcuts.filter((s) => {
    if (seen_actions.has(s.action_id)) return false;
    seen_actions.add(s.action_id);

    return true;
  });
}

export function format_shortcut_display(
  shortcut: ShortcutDefinition,
  is_mac: boolean,
): string {
  const parts: string[] = [];

  if (shortcut.modifier === "cmd+shift" || shortcut.modifier === "ctrl+shift") {
    parts.push(is_mac ? "⌘" : "Ctrl");
    parts.push(is_mac ? "⇧" : "Shift");
  } else if (shortcut.modifier === "cmd" || shortcut.modifier === "ctrl") {
    parts.push(is_mac ? "⌘" : "Ctrl");
  } else if (shortcut.modifier === "shift") {
    parts.push(is_mac ? "⇧" : "Shift");
  } else if (shortcut.modifier === "alt") {
    parts.push(is_mac ? "⌥" : "Alt");
  }

  if (shortcut["key"] === "Enter") {
    parts.push("↵");
  } else if (shortcut["key"] === "Escape") {
    parts.push("Esc");
  } else if (shortcut["key"] === "Backspace") {
    parts.push("⌫");
  } else if (shortcut["key"] === "Tab") {
    parts.push("⇥");
  } else if (shortcut["key"] === "ArrowUp") {
    parts.push("↑");
  } else if (shortcut["key"] === "ArrowDown") {
    parts.push("↓");
  } else if (shortcut["key"] === "ArrowLeft") {
    parts.push("←");
  } else if (shortcut["key"] === "ArrowRight") {
    parts.push("→");
  } else {
    parts.push(shortcut.key.toUpperCase());
  }

  return parts.join(is_mac ? "" : "+");
}

export function normalize_shortcut_key(key: string): string {
  const normalized = key.toLowerCase();
  const aliases: Record<string, string> = {
    esc: "escape",
    return: "enter",
    space: " ",
    spacebar: " ",
    del: "delete",
    ins: "insert",
  };

  return aliases[normalized] ?? normalized;
}

export function create_shortcut_signature(
  key: string,
  modifier?: ShortcutModifier,
): string {
  const parts: string[] = [];

  if (modifier) {
    parts.push(modifier);
  }

  parts.push(normalize_shortcut_key(key));

  return parts.join("+").toLowerCase();
}

export interface ShortcutConflict {
  signature: string;
  shortcuts: ShortcutDefinition[];
}

export function find_shortcut_conflicts(): ShortcutConflict[] {
  const signature_map = new Map<string, ShortcutDefinition[]>();

  for (const shortcut of KEYBOARD_SHORTCUTS) {
    const signature = create_shortcut_signature(
      shortcut.key,
      shortcut.modifier,
    );
    const existing = signature_map.get(signature) ?? [];

    existing.push(shortcut);
    signature_map.set(signature, existing);
  }

  const conflicts: ShortcutConflict[] = [];

  for (const [signature, shortcuts] of signature_map) {
    const unique_actions = new Set(shortcuts.map((s) => s.action_id));

    if (unique_actions.size > 1) {
      conflicts.push({ signature, shortcuts });
    }
  }

  return conflicts;
}

export function get_shortcut_by_key(
  key: string,
  modifier?: ShortcutModifier,
): ShortcutDefinition | null {
  const normalized_key = normalize_shortcut_key(key);

  return (
    KEYBOARD_SHORTCUTS.find(
      (s) =>
        normalize_shortcut_key(s.key) === normalized_key &&
        s.modifier === modifier,
    ) ?? null
  );
}

export function search_shortcuts(query: string): ShortcutDefinition[] {
  const normalized_query = query.toLowerCase().trim();

  if (!normalized_query) return [];

  return KEYBOARD_SHORTCUTS.filter(
    (s) =>
      s.description.toLowerCase().includes(normalized_query) ||
      s.action_id.toLowerCase().includes(normalized_query) ||
      s.key.toLowerCase().includes(normalized_query) ||
      s.category.toLowerCase().includes(normalized_query),
  );
}

export const ALL_ACTION_IDS: ShortcutActionId[] = [
  "next_email",
  "prev_email",
  "open_email",
  "close_viewer",
  "archive",
  "delete",
  "spam",
  "toggle_star",
  "mark_read",
  "mark_unread",
  "compose",
  "reply",
  "reply_all",
  "forward",
  "search",
  "command_palette",
  "show_shortcuts",
];
