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
  | "snooze"
  | "select_email"
  | "go_inbox"
  | "go_starred"
  | "go_sent"
  | "go_drafts"
  | "go_all"
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
    key: "b",
    description: "Snooze",
    category: "actions",
    action_id: "snooze",
  },
  {
    key: "x",
    description: "Select",
    category: "actions",
    action_id: "select_email",
  },

  {
    key: "g i",
    description: "Go to inbox",
    category: "navigation",
    action_id: "go_inbox",
  },
  {
    key: "g s",
    description: "Go to starred",
    category: "navigation",
    action_id: "go_starred",
  },
  {
    key: "g t",
    description: "Go to sent",
    category: "navigation",
    action_id: "go_sent",
  },
  {
    key: "g d",
    description: "Go to drafts",
    category: "navigation",
    action_id: "go_drafts",
  },
  {
    key: "g a",
    description: "Go to all mail",
    category: "navigation",
    action_id: "go_all",
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
