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
import type { ApiResponse } from "@/services/api/client";

import { useState } from "react";
import {
  ComputerDesktopIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Island,
  IslandEmpty,
  IslandRow,
  IslandSection,
  IslandSections,
  UpgradeBtn,
} from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { ButtonSpinner, Spinner } from "@/components/ui/spinner";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  revoke_device,
  type Device,
  type ListDevicesResponse,
} from "@/services/api/devices";
import { show_toast } from "@/components/toast/simple_toast";
import { use_settings_panel_data } from "@/components/settings/hooks/use_settings_prefetch";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { ignore_error } from "@/lib/ignore_error";
import {
  clear_plan_cache,
  get_current_plan_code,
} from "@/services/plan_limits";
import {
  app_locale,
  app_relative_dates,
  get_display_time_zone,
} from "@/utils/date_format";

function open_billing_settings() {
  window.dispatchEvent(
    new CustomEvent("navigate-settings", { detail: "billing" }),
  );
}

type Translate = ReturnType<typeof use_i18n>["t"];

function format_paired_date(value: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString(app_locale(), {
      timeZone: get_display_time_zone(),
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function format_last_seen(t: Translate, value: string | null): string {
  if (!value) return t("settings.trusted_devices_never");
  if (!app_relative_dates()) return format_paired_date(value);
  const diff_ms = Date.now() - new Date(value).getTime();

  if (Number.isNaN(diff_ms)) return value;
  const mins = Math.floor(diff_ms / 60000);

  if (mins < 5) return t("settings.bridge_active_now");
  if (mins < 60) return t("settings.minutes_ago", { count: mins });
  const hours = Math.floor(diff_ms / 3600000);

  if (hours < 24) return t("settings.hours_ago", { count: hours });
  const days = Math.floor(diff_ms / 86400000);

  if (days < 7) return t("settings.days_ago", { count: days });

  return format_paired_date(value);
}

export function TrustedDevicesPanel() {
  const { t } = use_i18n();
  const { limits } = use_plan_limits();
  const is_free_plan = !!limits && limits.plan_code === "free";
  const {
    data: cached,
    error: load_error,
    is_loading,
    revalidate,
  } = use_settings_panel_data<ApiResponse<ListDevicesResponse>>(
    "trusted_devices",
  );
  const devices_unavailable = !!load_error || !!cached?.error;

  const devices: Device[] = (cached?.data?.devices ?? []).filter(
    (d) => d.device_type !== "bridge",
  );

  const [revoking_id, set_revoking_id] = useState<string | null>(null);
  const [pending_revoke, set_pending_revoke] = useState<Device | null>(null);
  const [pending_revoke_all, set_pending_revoke_all] = useState(false);
  const [is_revoking_all, set_is_revoking_all] = useState(false);
  const [bridge_upgrade_modal_open, set_bridge_upgrade_modal_open] =
    useState(false);

  const handle_set_up = async (client: string) => {
    clear_plan_cache();
    const fresh_code = await get_current_plan_code();

    if (fresh_code === "free") {
      set_bridge_upgrade_modal_open(true);

      return;
    }
    await open_provision(client);
  };

  const handle_revoke = async (device: Device) => {
    set_revoking_id(device.id);
    const response = await revoke_device(device.id);

    if (response.error) {
      show_toast(response.error, "error");
    } else {
      await revalidate();
    }
    set_revoking_id(null);
    set_pending_revoke(null);
  };

  const handle_revoke_all = async () => {
    set_is_revoking_all(true);
    const responses = await Promise.all(
      devices.map((device) => revoke_device(device.id)),
    );

    const failed = responses.filter((r) => r.error);

    if (failed.length > 0) {
      show_toast(failed[0].error ?? t("common.something_went_wrong"), "error");
    } else {
      show_toast(t("settings.trusted_devices_revoked_all_toast"), "success");
    }
    await revalidate();
    set_is_revoking_all(false);
    set_pending_revoke_all(false);
  };

  const open_provision = async (label: string) => {
    const url = `aster-mail://provision?label=${encodeURIComponent(label)}`;
    const is_tauri =
      typeof window !== "undefined" &&
      ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

    if (is_tauri) {
      try {
        const { open } = await import("@tauri-apps/plugin-shell");

        await open(url);

        return;
      } catch (caught) {
        ignore_error(
          "components/settings/trusted_devices_panel:open_provision",
          caught,
        );
      }
    }
    window.location.href = url;
  };

  const confirm_device_name = pending_revoke?.name ?? "";

  return (
    <IslandSections>
      {is_free_plan ? (
        <IslandSection
          description={t("settings.desktop_bridge_upgrade_description")}
          icon={<EnvelopeIcon />}
          padding="md"
          title={t("settings.desktop_bridge_upgrade_title")}
        >
          <UpgradeBtn size="sm" onClick={open_billing_settings}>
            {t("settings.desktop_bridge_upgrade_cta")}
          </UpgradeBtn>
        </IslandSection>
      ) : (
        <IslandSection
          divided
          description={t("settings.desktop_bridge_description")}
          footer={t("settings.desktop_bridge_install_hint")}
          icon={<EnvelopeIcon />}
          title={t("settings.desktop_bridge_title")}
        >
          {["Thunderbird", "Apple Mail", "Outlook", "Generic IMAP"].map(
            (client) => (
              <IslandRow
                key={client}
                label={t("settings.desktop_bridge_set_up", { client })}
                on_press={() => handle_set_up(client)}
              />
            ),
          )}
        </IslandSection>
      )}

      <IslandSection
        bare
        description={t("settings.trusted_devices_description")}
        icon={<ShieldCheckIcon />}
        title={t("settings.trusted_devices")}
        trailing={
          devices.length > 1 ? (
            <Button
              className="whitespace-nowrap flex-shrink-0 text-[var(--color-danger)] hover:text-[var(--color-danger)]"
              disabled={is_revoking_all}
              variant="outline"
              onClick={() => set_pending_revoke_all(true)}
            >
              <TrashIcon className="w-3.5 h-3.5 me-1.5" />
              {t("settings.trusted_devices_revoke_all")}
              {is_revoking_all && <ButtonSpinner />}
            </Button>
          ) : undefined
        }
      >
        {is_loading && devices.length === 0 ? (
          <Island className="flex justify-center" padding="lg">
            <Spinner size="md" />
          </Island>
        ) : devices.length === 0 ? (
          devices_unavailable ? (
            <Island
              className="flex flex-wrap items-center justify-between gap-2"
              padding="sm"
            >
              <p className="text-[13px] text-txt-muted">
                {t("settings.failed_load_security_status")}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void revalidate()}
              >
                {t("settings.try_again")}
              </Button>
            </Island>
          ) : (
            <IslandEmpty
              icon={<ComputerDesktopIcon />}
              title={t("settings.trusted_devices_empty")}
            />
          )
        ) : (
          <Island divided>
            {devices.map((device) => (
              <IslandRow
                key={device.id}
                description={
                  <>
                    {t("settings.trusted_devices_created")}{" "}
                    {format_paired_date(device.created_at)}
                    {" · "}
                    {t("settings.trusted_devices_last_seen")}{" "}
                    {format_last_seen(t, device.last_seen_at)}
                  </>
                }
                icon={<ComputerDesktopIcon />}
                label={<span className="block truncate">{device.name}</span>}
                trailing={
                  <Button
                    className="flex-shrink-0"
                    disabled={revoking_id === device.id}
                    style={{ color: "var(--color-danger)" }}
                    variant="secondary"
                    onClick={() => set_pending_revoke(device)}
                  >
                    {t("settings.trusted_devices_revoke")}
                    {revoking_id === device.id && <ButtonSpinner />}
                  </Button>
                }
              />
            ))}
          </Island>
        )}
      </IslandSection>

      <ConfirmationModal
        cancel_text={t("auth.pair_device_cancel")}
        confirm_text={t("settings.desktop_bridge_upgrade_cta")}
        is_open={bridge_upgrade_modal_open}
        message={t("settings.desktop_bridge_upgrade_description")}
        on_cancel={() => set_bridge_upgrade_modal_open(false)}
        on_confirm={() => {
          set_bridge_upgrade_modal_open(false);
          open_billing_settings();
        }}
        title={t("settings.desktop_bridge_upgrade_title")}
        variant="info"
      />

      <ConfirmationModal
        cancel_text={t("auth.pair_device_cancel")}
        confirm_text={t("settings.trusted_devices_revoke")}
        is_open={pending_revoke !== null}
        message={t("settings.trusted_devices_revoke_confirm", {
          name: confirm_device_name,
        })}
        on_cancel={() => set_pending_revoke(null)}
        on_confirm={() => {
          if (pending_revoke) void handle_revoke(pending_revoke);
        }}
        title={t("settings.trusted_devices")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={t("auth.pair_device_cancel")}
        confirm_text={t("settings.trusted_devices_revoke_all")}
        is_open={pending_revoke_all}
        message={t("settings.trusted_devices_revoke_all_confirm")}
        on_cancel={() => set_pending_revoke_all(false)}
        on_confirm={() => void handle_revoke_all()}
        title={t("settings.trusted_devices")}
        variant="danger"
      />
    </IslandSections>
  );
}
