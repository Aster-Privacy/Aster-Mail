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
import { KeyboardShortcutBadgeView } from "@aster/ui";

import { get_shortcut_for_action } from "@/constants/keyboard_shortcuts";
import { is_mac_platform } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

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

export function KeyboardShortcutBadge({
  shortcut,
  action_id,
  modifier,
  size = "sm",
  variant = "default",
  show_on_touch = false,
  className,
}: KeyboardShortcutBadgeProps) {
  const { t } = use_i18n();
  const [is_mac, set_is_mac] = useState(false);

  useEffect(() => {
    set_is_mac(is_mac_platform());
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

  if (!resolved_shortcut) return null;

  return (
    <KeyboardShortcutBadgeView
      className={className}
      format_aria_label={(value) =>
        t("common.keyboard_shortcut_label", { shortcut: value })
      }
      is_mac={is_mac}
      modifier={resolved_shortcut.modifier}
      shortcut_key={resolved_shortcut.key}
      show_on_touch={show_on_touch}
      size={size}
      variant={variant}
    />
  );
}

export type { BadgeSize, KeyboardShortcutBadgeProps };
