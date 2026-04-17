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
import { TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import {
  revoke_device,
  revoke_all_devices,
  type Device,
  type ListDevicesResponse,
} from "@/services/api/devices";
import { show_toast } from "@/components/toast/simple_toast";
import { use_settings_panel_data } from "@/components/settings/hooks/use_settings_prefetch";

function format_date(value: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function TrustedDevicesPanel() {
  const { t } = use_i18n();
  const {
    data: cached,
    is_loading,
    revalidate,
  } = use_settings_panel_data<ApiResponse<ListDevicesResponse>>(
    "trusted_devices",
  );

  const devices: Device[] = cached?.data?.devices ?? [];

  const [revoking_id, set_revoking_id] = useState<string | null>(null);
  const [pending_revoke, set_pending_revoke] = useState<Device | null>(null);
  const [pending_revoke_all, set_pending_revoke_all] = useState(false);
  const [is_revoking_all, set_is_revoking_all] = useState(false);

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
    const response = await revoke_all_devices();

    if (response.error) {
      show_toast(response.error, "error");
    } else {
      await revalidate();
    }
    set_is_revoking_all(false);
    set_pending_revoke_all(false);
  };

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-txt-primary">
            {t("settings.trusted_devices")}
          </h2>
          <p className="text-sm mt-2 text-txt-tertiary">
            {t("settings.trusted_devices_description")}
          </p>
        </div>
        {devices.length > 1 && (
          <Button
            disabled={is_revoking_all}
            size="sm"
            variant="depth_destructive"
            onClick={() => set_pending_revoke_all(true)}
          >
            <TrashIcon className="w-4 h-4 mr-1" />
            {t("settings.trusted_devices_revoke_all")}
          </Button>
        )}
      </div>

      <div className="mt-6">
        {is_loading && devices.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : devices.length === 0 ? (
          <div
            className="text-sm text-txt-tertiary text-center py-8 rounded-lg"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-secondary)",
            }}
          >
            {t("settings.trusted_devices_empty")}
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between p-4 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  border: "1px solid var(--border-secondary)",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-txt-primary truncate">
                    {device.name}
                  </div>
                  <div className="text-xs mt-1 text-txt-tertiary">
                    {t("settings.trusted_devices_created")}:{" "}
                    {format_date(device.created_at)}
                  </div>
                  <div className="text-xs text-txt-tertiary">
                    {t("settings.trusted_devices_last_seen")}:{" "}
                    {device.last_seen_at
                      ? format_date(device.last_seen_at)
                      : t("settings.trusted_devices_never")}
                  </div>
                </div>
                <Button
                  disabled={revoking_id === device.id}
                  size="sm"
                  variant="destructive"
                  onClick={() => set_pending_revoke(device)}
                >
                  <TrashIcon className="w-4 h-4 mr-1" />
                  {t("settings.trusted_devices_revoke")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {pending_revoke && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onClick={() => set_pending_revoke(null)}
          />
          <div
            className="relative w-full max-w-sm p-6 rounded-xl bg-surf-primary"
            style={{ border: "1px solid var(--border-secondary)" }}
          >
            <h3 className="text-base font-semibold text-txt-primary">
              {t("settings.trusted_devices_revoke_confirm", {
                name: pending_revoke.name,
              })}
            </h3>
            <div className="flex gap-2 mt-6">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => set_pending_revoke(null)}
              >
                {t("auth.pair_device_cancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={revoking_id === pending_revoke.id}
                variant="destructive"
                onClick={() => handle_revoke(pending_revoke)}
              >
                {t("settings.trusted_devices_revoke")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {pending_revoke_all && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onClick={() => set_pending_revoke_all(false)}
          />
          <div
            className="relative w-full max-w-sm p-6 rounded-xl bg-surf-primary"
            style={{ border: "1px solid var(--border-secondary)" }}
          >
            <h3 className="text-base font-semibold text-txt-primary">
              {t("settings.trusted_devices_revoke_all_confirm")}
            </h3>
            <div className="flex gap-2 mt-6">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => set_pending_revoke_all(false)}
              >
                {t("auth.pair_device_cancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={is_revoking_all}
                variant="destructive"
                onClick={handle_revoke_all}
              >
                {t("settings.trusted_devices_revoke_all")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
