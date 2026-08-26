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
import { copy_text_or_throw } from "@/utils/copy_text";
import type { DecryptedEmailAlias } from "@/services/api/aliases";

import {
  ClipboardDocumentIcon,
  Cog6ToothIcon,
  PowerIcon,
} from "@heroicons/react/24/outline";

import { PinIcon } from "@/components/common/icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context_menu";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import { update_alias, toggle_alias_pin } from "@/services/api/aliases";
import { emit_aliases_changed } from "@/hooks/mail_events";

interface AliasContextMenuProps {
  children: React.ReactNode;
  alias: DecryptedEmailAlias;
  on_manage: () => void;
}

export function AliasContextMenu({
  children,
  alias,
  on_manage,
}: AliasContextMenuProps): React.ReactElement {
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const is_real_alias =
    !alias.id.startsWith("domain-") && !alias.id.startsWith("group-");

  const copy_address = async () => {
    try {
      await copy_text_or_throw(alias.full_address);
      show_toast(t("settings.alias_copied"), "success");
    } catch {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  const toggle_pin = async () => {
    if (is_feature_locked("has_advanced_aliases")) {
      prompt_upgrade(
        t("settings.feature_requires_upgrade"),
        undefined,
        "has_advanced_aliases",
      );

      return;
    }

    try {
      const response = await toggle_alias_pin(alias.id);

      if (response.error || !response.data) {
        show_toast(
          response.error || t("settings.alias_toggle_failed"),
          "error",
        );
      } else {
        show_toast(
          response.data.is_pinned
            ? t("settings.alias_pinned_toast")
            : t("settings.alias_unpinned_toast"),
          "success",
        );
        emit_aliases_changed();
      }
    } catch {
      show_toast(t("settings.alias_toggle_failed"), "error");
    }
  };

  const toggle_enabled = async () => {
    const next_enabled = !alias.is_enabled;

    try {
      const response = await update_alias(alias.id, {
        is_enabled: next_enabled,
      });

      if (response.error) {
        show_toast(
          response.error || t("settings.alias_toggle_failed"),
          "error",
        );
      } else {
        show_toast(
          next_enabled
            ? t("settings.alias_enabled_toast")
            : t("settings.alias_disabled_toast"),
          "success",
        );
        emit_aliases_changed();
      }
    } catch {
      show_toast(t("settings.alias_toggle_failed"), "error");
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={copy_address}>
          <ClipboardDocumentIcon className="me-2 h-4 w-4" />
          {t("common.copy_address")}
        </ContextMenuItem>

        {is_real_alias && (
          <ContextMenuItem onClick={toggle_pin}>
            <PinIcon
              className={`me-2 h-4 w-4 ${alias.is_pinned ? "-rotate-[38deg]" : ""}`}
              filled={!!alias.is_pinned}
              style={{
                color: alias.is_pinned
                  ? "var(--color-blue-500, #3b82f6)"
                  : undefined,
              }}
            />
            {alias.is_pinned
              ? t("settings.alias_unpin")
              : t("settings.alias_pin")}
          </ContextMenuItem>
        )}

        {is_real_alias && (
          <ContextMenuItem onClick={toggle_enabled}>
            <PowerIcon
              className="me-2 h-4 w-4"
              style={{
                color: alias.is_enabled
                  ? "var(--color-red-500, #ef4444)"
                  : "var(--color-green-500, #22c55e)",
              }}
            />
            <span
              style={{
                color: alias.is_enabled
                  ? "var(--color-red-500, #ef4444)"
                  : "var(--color-green-500, #22c55e)",
              }}
            >
              {alias.is_enabled ? t("common.disable") : t("common.enable")}
            </span>
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem onClick={on_manage}>
          <Cog6ToothIcon className="me-2 h-4 w-4" />
          {t("common.manage")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
