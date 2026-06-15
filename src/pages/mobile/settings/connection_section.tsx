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
import type { ConnectionMethod, ConnectionState } from "@/services/routing/types";

import { useState, useEffect, useCallback } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";

import { SettingsHeader } from "./shared";
import { connection_store } from "@/services/routing/connection_store";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { is_cdn_relay_supported } from "@/services/routing/tor_transport";

const OPTIONS: { value: ConnectionMethod; label_key: string; desc_key: string }[] = [
  {
    value: "direct",
    label_key: "settings.connection.direct",
    desc_key: "settings.connection.direct_description",
  },
  {
    value: "cdn_relay",
    label_key: "settings.connection.cdn_relay",
    desc_key: "settings.connection.cdn_relay_description",
  },
];

export function ConnectionSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const [state, set_state] = useState<ConnectionState>(
    connection_store.get_state(),
  );
  const [is_switching, set_is_switching] = useState(false);

  useEffect(() => connection_store.subscribe(set_state), []);

  const handle_change = useCallback(
    async (method: ConnectionMethod) => {
      if (method === state.method || is_switching) return;
      set_is_switching(true);
      try {
        await connection_store.set_method(method);
        show_toast(
          method === "cdn_relay"
            ? t("settings.connection.status_connected")
            : t("settings.connection.status_disconnected" as Parameters<typeof t>[0]),
          method === "cdn_relay" ? "success" : "info",
        );
      } catch (e) {
        show_toast(
          e instanceof Error
            ? e.message
            : t("settings.connection.status_error" as Parameters<typeof t>[0]),
          "error",
        );
      } finally {
        set_is_switching(false);
      }
    },
    [state.method, is_switching, t],
  );

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.connection.title" as Parameters<typeof t>[0])}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 pt-4">
          <p className="mb-4 text-[13px] text-[var(--mobile-text-secondary)]">
            {t("settings.connection.description" as Parameters<typeof t>[0])}
          </p>
          <div className="overflow-hidden rounded-2xl bg-[var(--mobile-bg-card)]">
            {OPTIONS.filter(
              (opt) => opt.value !== "cdn_relay" || is_cdn_relay_supported(),
            ).map((opt, i) => {
              const is_selected = state.method === opt.value;
              return (
                <button
                  key={opt.value}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-left active:opacity-80 disabled:opacity-50 ${i > 0 ? "border-t border-[var(--mobile-border,rgba(255,255,255,0.06))]" : ""}`}
                  disabled={is_switching}
                  type="button"
                  onClick={() => handle_change(opt.value)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-[var(--text-primary)]">
                      {t(opt.label_key as Parameters<typeof t>[0])}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-[var(--mobile-text-secondary)]">
                      {t(opt.desc_key as Parameters<typeof t>[0])}
                    </p>
                  </div>
                  {is_selected && (
                    <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--mobile-accent,#4f6ef7)]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
