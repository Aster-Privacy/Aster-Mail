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
import type { } from "@/services/api/aliases";
import type { TranslationKey } from "@/lib/i18n/types";

import {  useEffect,  useState } from "react";
import {
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";

import { format_created_at, format_relative_time } from "../alias_stats_format";

import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import {
  get_alias_stats,
  type AliasStats,
} from "@/services/api/aliases";

export function StatsPanel({
  alias_id,
  hide_created,
  locked,
}: {
  alias_id: string;
  hide_created?: boolean;
  locked?: boolean;
}) {
  const { t, language } = use_i18n();
  const [stats, set_stats] = useState<AliasStats | null>(null);
  const [last_sender, set_last_sender] = useState<string | null>(null);
  const [loading, set_loading] = useState(true);

  useEffect(() => {
    if (locked) {
      set_loading(false);

      return;
    }
    let active = true;

    set_loading(true);
    set_last_sender(null);
    get_alias_stats(alias_id)
      .then(async (stats_response) => {
        if (!active || !stats_response.data) return;
        set_stats(stats_response.data);

        const { last_sender_encrypted, last_sender_nonce } =
          stats_response.data;

        if (!last_sender_encrypted) return;

        const envelope = await decrypt_mail_envelope<{
          from: { name: string; email: string };
        }>(last_sender_encrypted, last_sender_nonce ?? "");

        if (active && envelope?.from?.email)
          set_last_sender(envelope.from.email);
      })
      .catch(() => {})
      .finally(() => {
        if (active) set_loading(false);
      });

    return () => {
      active = false;
    };
  }, [alias_id, locked]);

  if (loading) {
    return <Spinner size="sm" />;
  }

  const created_label = stats
    ? format_created_at(stats.created_at, language)
    : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-txt-muted">
        <span>
          {t("settings.alias_stats_received" as TranslationKey, {
            count: stats?.received ?? 0,
          })}
        </span>
        <span>
          {t("settings.alias_stats_forwarded" as TranslationKey, {
            count: stats?.forwarded ?? 0,
          })}
        </span>
        <span>
          {t("settings.alias_stats_blocked" as TranslationKey, {
            count: stats?.blocked ?? 0,
          })}
        </span>
        <span>
          {t("settings.alias_stats_replied" as TranslationKey, {
            count: stats?.replied ?? 0,
          })}
        </span>
      </div>

      {last_sender && stats?.last_sender_at && (
        <div className="flex items-center gap-1.5 text-sm text-txt-muted">
          <PaperAirplaneIcon className="w-4 h-4 shrink-0" />
          <span className="break-all">{last_sender}</span>
          <span aria-hidden="true">&middot;</span>
          <span className="whitespace-nowrap">
            {format_relative_time(t, stats.last_sender_at)}
          </span>
        </div>
      )}

      {created_label && !hide_created && (
        <div className="text-sm text-txt-muted">
          {t("settings.alias_stats_created" as TranslationKey, {
            date: created_label,
          })}
        </div>
      )}
    </div>
  );
}

