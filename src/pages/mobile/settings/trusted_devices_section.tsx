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
import { useState, useEffect, useCallback } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsHeader, SettingsRow } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import {
  list_devices,
  revoke_device,
  type Device,
} from "@/services/api/devices";
import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";

function format_date(value: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function TrustedDevicesSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const [devices, set_devices] = useState<Device[]>([]);
  const [loading, set_loading] = useState(true);
  const [revoking_id, set_revoking_id] = useState<string | null>(null);
  const [pending_revoke, set_pending_revoke] = useState<Device | null>(null);
  const [pending_revoke_all, set_pending_revoke_all] = useState(false);
  const [is_revoking_all, set_is_revoking_all] = useState(false);

  const load_devices = useCallback(async () => {
    set_loading(true);
    try {
      const response = await list_devices();

      set_devices(
        (response.data?.devices ?? []).filter(
          (d) => d.device_type !== "bridge",
        ),
      );
    } catch {
      set_devices([]);
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    load_devices();
  }, [load_devices]);

  const handle_revoke = useCallback(
    async (device: Device) => {
      set_revoking_id(device.id);
      const response = await revoke_device(device.id);

      if (response.error) {
        show_toast(response.error, "error");
      } else {
        await load_devices();
      }
      set_revoking_id(null);
      set_pending_revoke(null);
    },
    [load_devices],
  );

  const handle_revoke_all = useCallback(async () => {
    set_is_revoking_all(true);
    const responses = await Promise.all(
      devices.map((device) => revoke_device(device.id)),
    );

    const failed = responses.find((r) => r.error);
    if (failed?.error) {
      show_toast(failed.error, "error");
    } else {
      await load_devices();
    }
    set_is_revoking_all(false);
    set_pending_revoke_all(false);
  }, [devices, load_devices]);

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.trusted_devices")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 pt-4">
          <p className="text-[13px] text-[var(--text-muted)]">
            {t("settings.trusted_devices_description")}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size="md" />
          </div>
        ) : devices.length === 0 ? (
          <div className="px-4 py-10 text-center text-[14px] text-[var(--text-muted)]">
            {t("settings.trusted_devices_empty")}
          </div>
        ) : (
          <>
            <SettingsGroup>
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-3 px-4 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-[var(--text-primary)]">
                      {device.name}
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {t("settings.trusted_devices_last_seen")}:{" "}
                      {device.last_seen_at
                        ? format_date(device.last_seen_at)
                        : t("settings.trusted_devices_never")}
                    </p>
                  </div>
                  <button
                    className="flex shrink-0 items-center gap-1 rounded-[12px] px-3 py-1.5 text-[13px] font-medium text-[var(--color-danger,#ef4444)]"
                    disabled={revoking_id === device.id}
                    style={{ border: "1px solid var(--border-primary)" }}
                    type="button"
                    onClick={() => set_pending_revoke(device)}
                  >
                    {revoking_id === device.id ? (
                      <Spinner size="xs" />
                    ) : (
                      <TrashIcon className="h-4 w-4" />
                    )}
                    {t("settings.trusted_devices_revoke")}
                  </button>
                </div>
              ))}
            </SettingsGroup>

            {devices.length > 1 && (
              <SettingsGroup>
                <SettingsRow
                  destructive
                  label={t("settings.trusted_devices_revoke_all")}
                  on_press={() => set_pending_revoke_all(true)}
                  trailing={is_revoking_all ? <Spinner size="xs" /> : undefined}
                />
              </SettingsGroup>
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        cancel_text={t("auth.pair_device_cancel")}
        confirm_text={t("settings.trusted_devices_revoke")}
        is_open={!!pending_revoke}
        message={
          pending_revoke
            ? t("settings.trusted_devices_revoke_confirm", {
                name: pending_revoke.name,
              })
            : ""
        }
        on_cancel={() => set_pending_revoke(null)}
        on_confirm={() => pending_revoke && handle_revoke(pending_revoke)}
        title={t("settings.trusted_devices_revoke")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={t("auth.pair_device_cancel")}
        confirm_text={t("settings.trusted_devices_revoke_all")}
        is_open={pending_revoke_all}
        message={t("settings.trusted_devices_revoke_all_confirm")}
        on_cancel={() => set_pending_revoke_all(false)}
        on_confirm={handle_revoke_all}
        title={t("settings.trusted_devices_revoke_all")}
        variant="danger"
      />
    </div>
  );
}
