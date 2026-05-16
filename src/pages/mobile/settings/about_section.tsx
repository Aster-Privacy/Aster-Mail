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
import { useState, useCallback, useEffect, useRef } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsHeader, SettingsRow } from "./shared";

import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";

function DevInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[13px] text-[var(--mobile-text-muted)]">
        {label}
      </span>
      <span className="text-[13px] font-mono text-[var(--mobile-text-primary)] max-w-[60%] truncate text-right">
        {value}
      </span>
    </div>
  );
}

export function AboutSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { user } = use_auth();
  const tap_count_ref = useRef(0);
  const tap_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dev_mode, set_dev_mode] = useState(false);
  const [dev_loading, set_dev_loading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { get_dev_mode } = await import("@/services/api/preferences");
      const { get_vault_from_memory } = await import(
        "@/services/crypto/memory_key_store"
      );
      const vault = get_vault_from_memory();
      const result = await get_dev_mode(vault);

      set_dev_mode(result.data);
      set_dev_loading(false);
    };

    load();
  }, []);

  const handle_build_tap = useCallback(async () => {
    if (dev_mode) return;
    tap_count_ref.current += 1;
    if (tap_timer_ref.current) clearTimeout(tap_timer_ref.current);
    if (tap_count_ref.current >= 5) {
      tap_count_ref.current = 0;
      const { save_dev_mode } = await import("@/services/api/preferences");
      const { get_vault_from_memory } = await import(
        "@/services/crypto/memory_key_store"
      );
      const vault = get_vault_from_memory();

      if (!vault) return;
      await save_dev_mode(true, vault);
      set_dev_mode(true);
      window.dispatchEvent(
        new CustomEvent("dev-mode-changed", { detail: true }),
      );
      show_toast(t("common.developer_mode_enabled"), "success");
    } else {
      const remaining = 5 - tap_count_ref.current;

      if (tap_count_ref.current >= 3) {
        show_toast(
          t("common.taps_to_developer_mode", { count: String(remaining) }),
          "info",
        );
      }
      tap_timer_ref.current = setTimeout(() => {
        tap_count_ref.current = 0;
      }, 2000);
    }
  }, [dev_mode]);

  const handle_disable_dev_mode = useCallback(async () => {
    const { save_dev_mode } = await import("@/services/api/preferences");
    const { get_vault_from_memory } = await import(
      "@/services/crypto/memory_key_store"
    );
    const vault = get_vault_from_memory();

    if (!vault) return;
    await save_dev_mode(false, vault);
    set_dev_mode(false);
    window.dispatchEvent(
      new CustomEvent("dev-mode-changed", { detail: false }),
    );
    show_toast(t("common.developer_mode_disabled"), "info");
  }, []);

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.advanced")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <SettingsGroup>
          <SettingsRow
            icon={<InformationCircleIcon className="h-4 w-4" />}
            label={t("settings.build")}
            on_press={handle_build_tap}
            value={dev_mode ? `1.0.0 (${import.meta.env.MODE})` : "1.0.0"}
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            label={t("auth.privacy_policy")}
            on_press={() =>
              window.open(
                "https://astermail.org/privacy",
                "_blank",
                "noopener,noreferrer",
              )
            }
          />
          <SettingsRow
            label={t("auth.terms_of_service")}
            on_press={() =>
              window.open(
                "https://astermail.org/terms",
                "_blank",
                "noopener,noreferrer",
              )
            }
          />
        </SettingsGroup>

        {!dev_loading && dev_mode && (
          <>
            <div className="px-4 pt-4 pb-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--mobile-text-muted)]">
                {t("common.developer_label")}
              </p>
            </div>
            <SettingsGroup>
              <DevInfoRow
                label={t("common.user_id_label")}
                value={user?.id?.slice(0, 8) ?? "N/A"}
              />
              <DevInfoRow
                label={t("common.platform_label")}
                value={navigator.platform.split(" ")[0]}
              />
              <DevInfoRow
                label={t("common.viewport_label")}
                value={`${window.innerWidth}x${window.innerHeight}`}
              />
              <DevInfoRow
                label={t("common.screen_label")}
                value={`${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}x`}
              />
              <DevInfoRow
                label={t("common.user_agent_label")}
                value={navigator.userAgent.slice(0, 50)}
              />
              <DevInfoRow
                label={t("common.storage_keys")}
                value={`${localStorage.length} local, ${sessionStorage.length} session`}
              />
            </SettingsGroup>
            <div className="px-4 pt-3">
              <button
                className="w-full rounded-[16px] bg-[var(--mobile-bg-card)] py-3 text-[14px] font-medium text-[var(--mobile-danger)]"
                type="button"
                onClick={handle_disable_dev_mode}
              >
                {t("common.disable_developer_mode")}
              </button>
            </div>
            <div className="px-4 pt-2">
              <button
                className="w-full rounded-[16px] bg-[var(--mobile-bg-card)] py-3 text-[14px] font-medium text-[var(--mobile-accent)]"
                type="button"
                onClick={() => window.location.reload()}
              >
                {t("settings.force_reload")}
              </button>
            </div>
            <div className="px-4 pt-2">
              <button
                className="w-full rounded-[16px] bg-[var(--mobile-bg-card)] py-3 text-[14px] font-medium text-[var(--mobile-accent)]"
                type="button"
                onClick={async () => {
                  if ("serviceWorker" in navigator) {
                    const regs =
                      await navigator.serviceWorker.getRegistrations();

                    await Promise.all(regs.map((r) => r.unregister()));
                    show_toast(
                      t("common.service_workers_unregistered"),
                      "success",
                    );
                  }
                }}
              >
                {t("settings.unregister_service_workers")}
              </button>
            </div>
            <div className="px-4 pt-2 pb-4">
              <button
                className="w-full rounded-[16px] bg-[var(--mobile-bg-card)] py-3 text-[14px] font-medium text-[var(--mobile-danger)]"
                type="button"
                onClick={async () => {
                  localStorage.clear();
                  sessionStorage.clear();
                  if ("caches" in window) {
                    const names = await caches.keys();

                    await Promise.all(names.map((n) => caches.delete(n)));
                  }
                  window.location.reload();
                }}
              >
                {t("settings.clear_cache_reload")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
