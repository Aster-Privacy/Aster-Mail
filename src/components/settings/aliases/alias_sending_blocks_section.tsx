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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { useMemo, useState } from "react";
import {
  AtSymbolIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import {
  Badge,
  Island,
  IslandEmpty,
  IslandRow,
  IslandSection,
  IslandSections,
} from "@aster/ui";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { use_sender_aliases } from "@/hooks/use_sender_aliases";
import { emit_aliases_changed } from "@/hooks/mail_events";
import { show_toast } from "@/components/toast/simple_toast";
import {
  sending_block_change_for_option,
  update_sending_blocks,
} from "@/services/api/alias_sending_blocks";

const SENDING_BLOCK_OPTION_TYPES: SenderOption["type"][] = [
  "primary",
  "alias",
  "ghost",
  "domain",
];

export function are_all_sending_options_disabled(
  options: SenderOption[],
): boolean {
  return (
    options.length > 0 && options.every((option) => option.sending_disabled)
  );
}

export function filter_sending_block_options(
  options: SenderOption[],
  query: string,
): SenderOption[] {
  const needle = query.trim().toLowerCase();

  return options.filter((option) => {
    if (!SENDING_BLOCK_OPTION_TYPES.includes(option.type)) return false;
    if (option.is_catch_all) return false;
    if (!sending_block_change_for_option(option.id, true)) return false;
    if (!needle) return true;

    return (
      option.email.toLowerCase().includes(needle) ||
      (option.display_name ?? "").toLowerCase().includes(needle)
    );
  });
}

export function AliasSendingBlocksSection() {
  const { t } = use_i18n();
  const { sender_options, loading } = use_sender_aliases();
  const [query, set_query] = useState("");
  const [pending_ids, set_pending_ids] = useState<Set<string>>(new Set());

  const all_options = useMemo(
    () => filter_sending_block_options(sender_options, ""),
    [sender_options],
  );

  const visible_options = useMemo(
    () => filter_sending_block_options(sender_options, query),
    [sender_options, query],
  );

  const all_disabled = are_all_sending_options_disabled(all_options);

  const handle_toggle = async (option: SenderOption, enabled: boolean) => {
    const change = sending_block_change_for_option(option.id, !enabled);

    if (!change) return;
    set_pending_ids((prev) => new Set(prev).add(option.id));
    const result = await update_sending_blocks([change]);

    set_pending_ids((prev) => {
      const next = new Set(prev);

      next.delete(option.id);

      return next;
    });
    if (result.error) {
      show_toast(t("settings.sending_blocks_update_failed"), "error");

      return;
    }
    emit_aliases_changed();
  };

  const render_list = () => {
    if (visible_options.length > 0) {
      return (
        <Island divided data-testid="sending-blocks-list">
          {visible_options.map((option) => (
            <IslandRow
              key={option.id}
              data-sending-disabled={
                option.sending_disabled ? "true" : "false"
              }
              description={
                option.sending_disabled ? (
                  <span className="text-[var(--color-danger)]">
                    {t("mail.sending_disabled_badge")}
                  </span>
                ) : (
                  t("settings.sending_blocks_sending_allowed")
                )
              }
              label={
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate" title={option.email}>
                    {option.email}
                  </span>
                  {option.type === "primary" && (
                    <Badge className="flex-shrink-0" color="gray">
                      {t("settings.sending_blocks_primary_label")}
                    </Badge>
                  )}
                </span>
              }
              toggle={{
                checked: !option.sending_disabled,
                disabled: pending_ids.has(option.id),
                size: "lg",
                aria_label: t("settings.sending_blocks_toggle_label", {
                  email: option.email,
                }),
                on_change: (enabled) => handle_toggle(option, enabled),
              }}
            />
          ))}
        </Island>
      );
    }

    if (loading) {
      return (
        <Island className="flex justify-center" padding="md">
          <Spinner size="md" />
        </Island>
      );
    }

    if (all_options.length === 0) {
      return (
        <IslandEmpty
          icon={<AtSymbolIcon />}
          title={t("settings.sending_blocks_empty")}
        />
      );
    }

    return (
      <IslandEmpty
        description={t("settings.try_different_search")}
        icon={<MagnifyingGlassIcon />}
        title={t("common.no_results")}
      />
    );
  };

  return (
    <IslandSections>
      <IslandSection
        bare
        description={t("settings.sending_blocks_description")}
        icon={<PaperAirplaneIcon />}
        title={t("settings.sending_blocks_title")}
      >
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-muted pointer-events-none" />
            <Input
              aria-label={t("settings.sending_blocks_search_placeholder")}
              className="aster_input_tonal"
              placeholder={t("settings.sending_blocks_search_placeholder")}
              size="md"
              style={{ paddingInlineStart: "38px" }}
              value={query}
              onChange={(e) => set_query(e.target.value)}
            />
          </div>
        </div>
        {all_disabled && (
          <Island
            data-testid="sending-blocks-all-disabled"
            padding="md"
            role="status"
            tone="danger"
          >
            <p className="text-sm">{t("settings.sending_blocks_all_disabled")}</p>
          </Island>
        )}
        {render_list()}
      </IslandSection>
    </IslandSections>
  );
}
