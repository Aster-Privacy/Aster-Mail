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
import { useEffect, useState, useCallback } from "react";
import { Button } from "@aster/ui";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";

import {
  list_trusted_devices,
  revoke_trusted_device,
  revoke_all_trusted_devices,
  TrustedDeviceItem,
} from "@/services/api/trusted_devices";
import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { use_i18n } from "@/lib/i18n/context";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

function format_date(iso: string): string {
  try {
    return new Date(iso).toLocaleString(app_locale(), {
      timeZone: get_display_time_zone(),
    });
  } catch {
    return iso;
  }
}

export function TrustedDevicesSection() {
  const { t } = use_i18n();
  const [devices, set_devices] = useState<TrustedDeviceItem[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [busy_id, set_busy_id] = useState<string | null>(null);
  const [revoke_all_busy, set_revoke_all_busy] = useState(false);
  const [confirm_revoke_id, set_confirm_revoke_id] = useState<string | null>(
    null,
  );
  const [confirm_revoke_all, set_confirm_revoke_all] = useState(false);

  const load = useCallback(async () => {
    set_is_loading(true);
    set_error(null);
    const res = await list_trusted_devices();

    if (res.error) {
      set_error(res.error);
      set_is_loading(false);

      return;
    }
    set_devices(res.data?.devices ?? []);
    set_is_loading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handle_revoke = async (id: string) => {
    set_confirm_revoke_id(null);
    set_busy_id(id);
    const res = await revoke_trusted_device(id);

    set_busy_id(null);
    if (res.error) {
      show_toast(res.error, "error");

      return;
    }
    set_devices((prev) => prev.filter((d) => d.id !== id));
    show_toast(t("settings.trusted_2fa_revoked_toast"), "success");
  };

  const handle_revoke_all = async () => {
    set_confirm_revoke_all(false);
    set_revoke_all_busy(true);
    const res = await revoke_all_trusted_devices();

    set_revoke_all_busy(false);
    if (res.error) {
      show_toast(res.error, "error");

      return;
    }
    set_devices([]);
    show_toast(t("settings.trusted_2fa_revoked_all_toast"), "success");
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <ShieldCheckIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.trusted_2fa_title")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      <p className="text-sm text-txt-muted mb-4">
        {t("settings.trusted_2fa_description")}
      </p>

      {is_loading ? (
        <p className="text-sm text-txt-muted">{t("common.loading")}</p>
      ) : error ? (
        <LoadFailedNotice on_retry={load} />
      ) : devices.length === 0 ? (
        <div className="py-6 text-center">
          <ShieldCheckIcon className="w-8 h-8 text-txt-muted mx-auto mb-2" />
          <p className="text-sm text-txt-muted">
            {t("settings.trusted_2fa_empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-md border border-edge-secondary p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-txt-primary truncate">
                  {d.label}
                </p>
                <p className="text-xs text-txt-muted truncate">
                  {t("settings.trusted_2fa_last_used", {
                    when: format_date(d.last_used_at),
                  })}
                  {" - "}
                  {t("settings.trusted_2fa_expires", {
                    when: format_date(d.expires_at),
                  })}
                </p>
                {d.ip_snippet ? (
                  <p className="text-xs text-txt-muted truncate">
                    {d.ip_snippet}
                  </p>
                ) : null}
              </div>
              <Button
                disabled={busy_id === d.id}
                is_loading={busy_id === d.id}
                variant="outline"
                onClick={() => set_confirm_revoke_id(d.id)}
              >
                {t("settings.trusted_2fa_revoke")}
              </Button>
            </div>
          ))}

          <div className="pt-2">
            <Button
              disabled={revoke_all_busy}
              is_loading={revoke_all_busy}
              variant="outline"
              onClick={() => set_confirm_revoke_all(true)}
            >
              {t("settings.trusted_2fa_revoke_all")}
            </Button>
          </div>
        </div>
      )}

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("settings.trusted_2fa_revoke")}
        is_open={confirm_revoke_id !== null}
        message={t("settings.trusted_2fa_revoke_confirm")}
        on_cancel={() => set_confirm_revoke_id(null)}
        on_confirm={() => {
          if (confirm_revoke_id) void handle_revoke(confirm_revoke_id);
        }}
        title={t("settings.trusted_2fa_title")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("settings.trusted_2fa_revoke_all")}
        is_open={confirm_revoke_all}
        message={t("settings.trusted_2fa_revoke_all_confirm")}
        on_cancel={() => set_confirm_revoke_all(false)}
        on_confirm={() => void handle_revoke_all()}
        title={t("settings.trusted_2fa_title")}
        variant="danger"
      />
    </div>
  );
}
