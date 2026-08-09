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
import type { } from "@/lib/i18n/types";

import { useCallback, useEffect,  useState } from "react";
import {
  
  
  AdjustmentsHorizontalIcon,
  NoSymbolIcon,
  
  EyeSlashIcon,
  
} from "@heroicons/react/24/outline";

import {  format_relative_time } from "../alias_stats_format";

import { } from "@/components/settings/aliases/alias_rule_editor_modal";
import { } from "@/components/settings/aliases/alias_websites_editor";
import { } from "@/components/email/shared/decrypt_envelope";
import { use_i18n } from "@/lib/i18n/context";
import { } from "@/components/toast/simple_toast";
import { Spinner } from "@/components/ui/spinner";
import { } from "@/components/ui/input";
import { } from "@/components/settings/aliases/feature_lock";
import { } from "@/hooks/use_folders";
import { } from "@/hooks/use_tags";
import { } from "@/components/settings/aliases/info_hint";
import {
  get_alias_delivery_log,
  get_domain_address_delivery_log,
  
  type DeliveryEvent,
  
} from "@/services/api/aliases";

export function delivery_reason_label(
  t: ReturnType<typeof use_i18n>["t"],
  reason: string,
): string {
  switch (reason) {
    case "sender_pin":
      return t("settings.alias_delivery_log_reason_sender_pin");
    case "alias_rule":
      return t("settings.alias_delivery_log_reason_alias_rule");
    case "alias_disabled":
      return t("settings.alias_delivery_log_reason_alias_disabled");
    default:
      return t("settings.alias_delivery_log_reason_unknown");
  }
}

export function delivery_reason_icon(reason: string): React.ReactNode {
  switch (reason) {
    case "sender_pin":
      return <NoSymbolIcon className="w-4 h-4 text-red-500 shrink-0" />;
    case "alias_rule":
      return (
        <AdjustmentsHorizontalIcon className="w-4 h-4 text-orange-500 shrink-0" />
      );
    case "alias_disabled":
      return <EyeSlashIcon className="w-4 h-4 text-txt-muted shrink-0" />;
    default:
      return <NoSymbolIcon className="w-4 h-4 text-txt-muted shrink-0" />;
  }
}

export function DeliveryLogPanel({
  alias_id,
  domain_address_id,
  locked,
}: {
  alias_id?: string;
  domain_address_id?: string;
  locked?: boolean;
}) {
  const { t } = use_i18n();
  const [events, set_events] = useState<DeliveryEvent[]>([]);
  const [loading, set_loading] = useState(true);
  const [expanded, set_expanded] = useState(false);

  const load = useCallback(async () => {
    if (locked) {
      set_loading(false);

      return;
    }
    set_loading(true);
    try {
      const response = domain_address_id
        ? await get_domain_address_delivery_log(domain_address_id)
        : await get_alias_delivery_log(alias_id!);

      if (response.data) {
        set_events(response.data.events ?? []);
      }
    } catch {
      set_events([]);
    } finally {
      set_loading(false);
    }
  }, [alias_id, domain_address_id, locked]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      {loading ? (
        <Spinner size="md" />
      ) : events.length === 0 ? (
        <p className="text-xs text-txt-muted">
          {t("settings.alias_delivery_log_empty")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {(expanded ? events : events.slice(0, 3)).map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surf-tertiary border border-edge-secondary"
            >
              {delivery_reason_icon(ev.blocked_reason)}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-txt-primary truncate">
                  {delivery_reason_label(t, ev.blocked_reason)}
                </p>
                <p className="text-xs text-txt-muted">
                  {format_relative_time(t, ev.created_at)}
                </p>
              </div>
            </div>
          ))}
          {events.length > 3 && (
            <button
              className="text-xs text-txt-muted hover:text-txt-primary transition-colors"
              onClick={() => set_expanded((v) => !v)}
            >
              {expanded
                ? t("common.show_less")
                : t("common.n_more", { count: events.length - 3 })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

