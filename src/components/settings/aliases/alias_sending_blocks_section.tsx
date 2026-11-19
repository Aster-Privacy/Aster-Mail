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
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { IslandSection, IslandSections, Switch } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { use_sender_aliases } from "@/hooks/use_sender_aliases";
import { emit_aliases_changed } from "@/hooks/mail_events";
import { show_toast } from "@/components/toast/simple_toast";
import {
  sending_block_change_for_option,
  update_sending_blocks,
} from "@/services/api/alias_sending_blocks";

export function filter_sending_block_options(
  options: SenderOption[],
  query: string,
): SenderOption[] {
  const needle = query.trim().toLowerCase();

  return options.filter((option) => {
    if (option.type !== "alias" && option.type !== "domain") return false;
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

  const visible_options = useMemo(
    () => filter_sending_block_options(sender_options, query),
    [sender_options, query],
  );

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

  return (
    <IslandSections>
      <IslandSection
        description={t("settings.sending_blocks_description")}
        title={t("settings.sending_blocks_title")}
      >
        <div className="relative mb-3">
          <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-muted pointer-events-none" />
          <Input
            aria-label={t("settings.sending_blocks_search_placeholder")}
            className="ps-9"
            placeholder={t("settings.sending_blocks_search_placeholder")}
            size="md"
            value={query}
            onChange={(e) => set_query(e.target.value)}
          />
        </div>
        {!loading && visible_options.length === 0 && (
          <p className="py-6 text-center text-sm text-txt-muted">
            {query.trim()
              ? t("settings.sending_blocks_no_results")
              : t("settings.sending_blocks_empty")}
          </p>
        )}
        <ul
          className="divide-y divide-edge-secondary"
          data-testid="sending-blocks-list"
        >
          {visible_options.map((option) => {
            const sending_enabled = !option.sending_disabled;

            return (
              <li
                key={option.id}
                className="flex items-center gap-3 py-2.5"
                data-sending-disabled={
                  option.sending_disabled ? "true" : "false"
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-txt-primary">
                    {option.email}
                  </p>
                  <p
                    className={
                      option.sending_disabled
                        ? "text-xs text-[var(--color-danger)]"
                        : "text-xs text-txt-muted"
                    }
                  >
                    {option.sending_disabled
                      ? t("mail.sending_disabled_badge")
                      : t("settings.sending_blocks_sending_allowed")}
                  </p>
                </div>
                <Switch
                  aria-label={t("settings.sending_blocks_toggle_label", {
                    email: option.email,
                  })}
                  checked={sending_enabled}
                  disabled={pending_ids.has(option.id)}
                  size="lg"
                  onCheckedChange={(v) => handle_toggle(option, v)}
                />
              </li>
            );
          })}
        </ul>
      </IslandSection>
    </IslandSections>
  );
}
