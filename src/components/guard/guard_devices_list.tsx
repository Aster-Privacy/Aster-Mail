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
import type { GuardStatus } from "@/services/api/guard";
import type { GuardDevice } from "@/services/guard/guard_device";

import { useState } from "react";
import { FingerPrintIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Badge, Island, IslandRow, IslandSection } from "@aster/ui";

import { GuardDeviceIcon } from "@/components/guard/guard_visuals";
import { guard_error_text } from "@/components/guard/guard_error_text";
import { format_guard_time } from "@/components/guard/guard_waiting_screen";
import { use_guard_step_up } from "@/components/guard/use_guard_step_up";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { show_toast } from "@/components/toast/simple_toast";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { remove_approver_device } from "@/services/guard/guard_changes";

interface GuardDevicesListProps {
  user_id: string;
  status: GuardStatus;
  device: GuardDevice | null;
  on_refresh: () => void;
}

export function GuardDevicesList({
  user_id,
  status,
  device,
  on_refresh,
}: GuardDevicesListProps) {
  const { t } = use_i18n();
  const step_up = use_guard_step_up();
  const [confirm_id, set_confirm_id] = useState<string | null>(null);
  const [busy_id, set_busy_id] = useState<string | null>(null);
  const this_id = status.this_device?.id ?? null;
  const can_act = !!device && !!this_id;

  const remove = async (device_id: string) => {
    if (!device || busy_id) return;
    set_busy_id(device_id);
    try {
      const response = await step_up.run((proof) =>
        remove_approver_device(device, user_id, device_id, proof),
      );

      if (!response) return;
      if (response.held) {
        show_toast(
          t("guard.devices_remove_held", {
            time: format_guard_time(response.held.apply_after),
          }),
          "info",
        );
      } else if (response.error) {
        show_toast(
          guard_error_text(t, response, "guard.devices_remove_error"),
          "error",
        );
      } else {
        show_toast(t("guard.devices_removed"), "success");
      }
      on_refresh();
    } catch {
      show_toast(t("guard.devices_remove_error"), "error");
    } finally {
      set_busy_id(null);
    }
  };

  const request_remove = (device_id: string) => {
    if (device_id === this_id) {
      set_confirm_id(device_id);

      return;
    }
    void remove(device_id);
  };

  return (
    <IslandSection
      bare
      data-testid="guard_devices_list"
      icon={<FingerPrintIcon />}
      title={t("guard.devices_title")}
    >
      <Island>
        {status.devices.map((item) => (
          <IslandRow
            key={item.id}
            data-testid={`guard_device_${item.id}`}
            description={
              item.approved_at
                ? t("guard.devices_added_at", {
                    time: format_guard_time(item.approved_at),
                  })
                : undefined
            }
            icon={
              <GuardDeviceIcon
                data-testid={`guard_device_icon_${item.id}`}
                device_type={item.device_type}
                name={item.name}
              />
            }
            label={
              <span className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="truncate">{item.name}</span>
                {item.id === this_id && (
                  <Badge color="blue">{t("guard.devices_this_device")}</Badge>
                )}
              </span>
            }
            trailing={
              can_act ? (
                <button
                  aria-label={t("guard.devices_remove")}
                  className="w-8 h-8 rounded-[var(--aster-radius-control)] flex items-center justify-center text-txt-muted hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  data-testid={`guard_device_remove_${item.id}`}
                  disabled={busy_id !== null}
                  type="button"
                  onClick={() => request_remove(item.id)}
                >
                  {busy_id === item.id ? (
                    <Spinner size="sm" />
                  ) : (
                    <TrashIcon className="w-4 h-4" />
                  )}
                </button>
              ) : undefined
            }
          />
        ))}
      </Island>
      <ConfirmationModal
        confirm_text={t("guard.devices_remove")}
        is_open={confirm_id !== null}
        message={t("guard.devices_remove_this_device")}
        title={t("guard.devices_remove_title")}
        variant="danger"
        on_cancel={() => set_confirm_id(null)}
        on_confirm={() => {
          const id = confirm_id;

          set_confirm_id(null);
          if (id) void remove(id);
        }}
      />
      {step_up.step_up_modal}
    </IslandSection>
  );
}
