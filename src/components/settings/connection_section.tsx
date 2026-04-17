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
  ConnectionMethod,
  ConnectionState,
} from "@/services/routing/types";

import { useState, useEffect, useCallback } from "react";
import { SignalIcon } from "@heroicons/react/24/outline";
import { Radio } from "@aster/ui";

import { cn } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { connection_store } from "@/services/routing/connection_store";
import { tor_start, tor_stop } from "@/services/routing/tor_transport";

interface ConnectionOptionDef {
  value: ConnectionMethod;
  label_key: string;
  image: string;
}

const CONNECTION_OPTIONS: ConnectionOptionDef[] = [
  {
    value: "direct",
    label_key: "settings.connection.direct",
    image: "/settings/direct.webp",
  },
  {
    value: "tor",
    label_key: "settings.connection.tor",
    image: "/settings/tor.webp",
  },
  {
    value: "tor_snowflake",
    label_key: "settings.connection.tor_snowflake",
    image: "/settings/snow_tor.webp",
  },
  {
    value: "cdn_relay",
    label_key: "settings.connection.cdn_relay",
    image: "/settings/cdn.webp",
  },
];

export function ConnectionSection() {
  const { t } = use_i18n();
  const [state, set_state] = useState<ConnectionState>(
    connection_store.get_state(),
  );
  const [is_switching, set_is_switching] = useState(false);

  useEffect(() => {
    const unsubscribe = connection_store.subscribe(set_state);

    return unsubscribe;
  }, []);

  const handle_method_change = useCallback(
    async (method: ConnectionMethod) => {
      if (method === state.method || is_switching) return;

      set_is_switching(true);

      try {
        if (state.method === "tor" || state.method === "tor_snowflake") {
          await tor_stop();
        }

        await connection_store.set_method(method);

        if (method === "tor" || method === "tor_snowflake") {
          connection_store.set_status("connecting");
          await tor_start(method === "tor_snowflake");
          connection_store.set_status("connected");
          show_toast(t("settings.connection.status_connected"), "success");
        } else if (method === "cdn_relay") {
          connection_store.set_status("connected");
          show_toast(t("settings.connection.status_connected"), "success");
        } else {
          connection_store.set_status("disconnected");
          show_toast(t("settings.connection.status_disconnected"), "info");
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.connection.status_error");

        connection_store.set_status("error", message);
        show_toast(message, "error");
      } finally {
        set_is_switching(false);
      }
    },
    [state.method, is_switching, t],
  );

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <SignalIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.connection.title")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>
      <p className="text-sm mb-4 text-txt-muted">
        {t("settings.connection.description")}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {CONNECTION_OPTIONS.map((option) => {
          const is_selected = state.method === option.value;

          return (
            <button
              key={option.value}
              className={cn(
                "rounded-xl border-2 overflow-hidden transition-colors text-left",
                is_switching && "opacity-60 pointer-events-none",
                is_selected ? "border-brand" : "border-edge-secondary",
              )}
              disabled={is_switching}
              type="button"
              onClick={() => handle_method_change(option.value)}
            >
              <div className="h-40 overflow-hidden">
                <img
                  alt=""
                  className="w-full h-full object-cover"
                  draggable={false}
                  loading="lazy"
                  src={option.image}
                />
              </div>

              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm font-medium text-txt-primary">
                  {t(option.label_key as Parameters<typeof t>[0])}
                </span>
                <span className="pointer-events-none flex-shrink-0">
                  <Radio readOnly checked={is_selected} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
