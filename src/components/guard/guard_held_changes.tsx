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
import type { GuardHoldKind } from "@/services/api/client/helpers";
import type { GuardPendingChange } from "@/services/api/guard";
import type { GuardDevice } from "@/services/guard/guard_device";

import type { ComponentType } from "react";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUturnRightIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  DocumentArrowDownIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  KeyIcon,
  LifebuoyIcon,
  LockOpenIcon,
  PhoneIcon,
  QuestionMarkCircleIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";
import { IslandRow, IslandSection } from "@aster/ui";

import { open_guard_panic } from "@/components/guard/guard_panic_dialog";
import { use_guard_now } from "@/components/guard/guard_visuals";
import { format_guard_time } from "@/components/guard/guard_waiting_screen";
import { use_guard_step_up } from "@/components/guard/use_guard_step_up";
import { show_toast } from "@/components/toast/simple_toast";
import { Button } from "@/components/ui/button";
import { use_i18n } from "@/lib/i18n/context";
import {
  GUARD_HELD_EVENT,
  is_guard_hold_skippable,
} from "@/services/api/client/helpers";
import { list_guard_changes } from "@/services/api/guard";
import {
  cancel_held_change,
  skip_held_change,
} from "@/services/guard/guard_changes";
import { on_guard_event } from "@/services/guard/guard_events";

export const HELD_KIND_KEYS = {
  forwarding_change: "guard.held_kind_forwarding_change",
  mail_rule_change: "guard.held_kind_mail_rule_change",
  mail_app_activation: "guard.held_kind_mail_app_activation",
  guard_device_remove: "guard.held_kind_guard_device_remove",
  recovery_email_change: "guard.held_kind_recovery_email_change",
  recovery_phone_change: "guard.held_kind_recovery_phone_change",
  password_change: "guard.held_kind_password_change",
  second_factor_off: "guard.held_kind_second_factor_off",
  data_export: "guard.held_kind_data_export",
  pgp_export: "guard.held_kind_pgp_export",
  guard_switches_off: "guard.held_kind_guard_switches_off",
  account_recovery: "guard.held_kind_account_recovery",
  rescue: "guard.held_kind_rescue",
  unknown: "guard.held_kind_unknown",
} as const satisfies Record<GuardHoldKind, string>;

const LISTED_ELSEWHERE = new Set(["guard_switches_off"]);

const URGENT_KINDS = new Set<GuardHoldKind>(["account_recovery", "rescue"]);

const HELD_KIND_ICONS: Record<
  GuardHoldKind,
  ComponentType<{ className?: string }>
> = {
  forwarding_change: ArrowUturnRightIcon,
  mail_rule_change: FunnelIcon,
  mail_app_activation: DevicePhoneMobileIcon,
  guard_device_remove: ShieldExclamationIcon,
  recovery_email_change: EnvelopeIcon,
  recovery_phone_change: PhoneIcon,
  password_change: KeyIcon,
  second_factor_off: LockOpenIcon,
  data_export: ArrowDownTrayIcon,
  pgp_export: DocumentArrowDownIcon,
  guard_switches_off: ShieldExclamationIcon,
  account_recovery: LifebuoyIcon,
  rescue: ExclamationTriangleIcon,
  unknown: QuestionMarkCircleIcon,
};

export function hold_progress(change: GuardPendingChange, now: number): number {
  const start = Date.parse(change.created_at);
  const end = Date.parse(change.apply_after);

  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;

  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export function format_time_left(apply_after: string, now: number): string {
  const ms = Date.parse(apply_after) - now;

  if (Number.isNaN(ms)) return "";
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });

  if (minutes < 60) return format.format(minutes, "minute");
  const hours = Math.round(minutes / 60);

  if (hours < 48) return format.format(hours, "hour");

  return format.format(Math.round(hours / 24), "day");
}

export function use_guard_changes(enabled: boolean) {
  const [changes, set_changes] = useState<GuardPendingChange[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      set_changes([]);

      return;
    }
    const response = await list_guard_changes();

    if (!response.error && response.data) set_changes(response.data.changes);
  }, [enabled]);

  useEffect(() => {
    void refresh();
    const on_held = () => void refresh();
    const stop = on_guard_event((event) => {
      if (
        event.event === "change_held" ||
        event.event === "change_applied" ||
        event.event === "change_cancelled" ||
        event.event === "panic"
      ) {
        void refresh();
      }
    });

    window.addEventListener(GUARD_HELD_EVENT, on_held);

    return () => {
      stop();
      window.removeEventListener(GUARD_HELD_EVENT, on_held);
    };
  }, [refresh]);

  return { changes, refresh };
}

interface GuardHeldChangesProps {
  user_id: string;
  device: GuardDevice | null;
  on_refresh: () => void;
}

export function GuardHeldChanges({
  user_id,
  device,
  on_refresh,
}: GuardHeldChangesProps) {
  const { t } = use_i18n();
  const step_up = use_guard_step_up();
  const { changes, refresh } = use_guard_changes(true);
  const [busy_id, set_busy_id] = useState<string | null>(null);
  const now = use_guard_now(30_000);
  const shown = changes.filter((change) => !LISTED_ELSEWHERE.has(change.kind));

  const after = async () => {
    await refresh();
    on_refresh();
  };

  const cancel = async (change: GuardPendingChange) => {
    if (!device || busy_id) return;
    set_busy_id(change.id);
    try {
      const response = await cancel_held_change(device, user_id, change.id);

      if (response.error) {
        show_toast(t("guard.held_error"), "error");
      } else {
        show_toast(t("guard.held_cancelled"), "success");
      }
      await after();
    } catch {
      show_toast(t("guard.held_error"), "error");
    } finally {
      set_busy_id(null);
    }
  };

  const skip = async (change: GuardPendingChange) => {
    if (!device || busy_id) return;
    set_busy_id(change.id);
    try {
      const proof = await step_up.request_proof();

      if (!proof) return;
      const response = await skip_held_change(
        device,
        user_id,
        change.id,
        proof,
      );

      if (response.error) {
        show_toast(t("guard.held_error"), "error");
      } else {
        show_toast(t("guard.held_skipped"), "success");
      }
      await after();
    } catch {
      show_toast(t("guard.held_error"), "error");
    } finally {
      set_busy_id(null);
    }
  };

  return (
    <IslandSection
      data-testid={shown.length === 0 ? undefined : "guard_held_changes"}
      icon={<ClockIcon />}
      padding={shown.length === 0 ? "lg" : "none"}
      title={t("guard.held_title")}
    >
      {shown.length === 0 ? (
        <p
          className="text-sm text-center text-txt-muted"
          data-testid="guard_held_empty"
        >
          {t("guard.held_empty_body")}
        </p>
      ) : (
        shown.map((change) => {
          const urgent = URGENT_KINDS.has(change.kind);
          const Icon = HELD_KIND_ICONS[change.kind] ?? QuestionMarkCircleIcon;
          const kind_label = t(
            HELD_KIND_KEYS[change.kind] ?? HELD_KIND_KEYS.unknown,
          );

          return (
            <IslandRow
              key={change.id}
              aria-label={kind_label}
              data-testid={`guard_held_${change.id}`}
              description={
                <>
                  {t("guard.held_applies_at", {
                    time: format_guard_time(change.apply_after),
                    left: format_time_left(change.apply_after, now),
                  })}
                  {urgent && (
                    <span className="mt-0.5 block text-red-500">
                      {t("guard.held_urgent_body")}
                    </span>
                  )}
                </>
              }
              icon={<Icon />}
              label={kind_label}
              layout="stacked"
              trailing={
                <span className="flex flex-wrap items-center gap-2">
                  <Button
                    data-testid={`guard_held_not_me_${change.id}`}
                    className="gap-1.5"
                    size="sm"
                    variant="destructive"
                    onClick={() => open_guard_panic()}
                  >
                    <ShieldExclamationIcon aria-hidden className="h-4 w-4" />
                    {t("guard.not_me")}
                  </Button>
                  {device && (
                    <Button
                      data-testid={`guard_held_cancel_${change.id}`}
                      disabled={busy_id !== null}
                      size="sm"
                      variant="outline"
                      onClick={() => void cancel(change)}
                    >
                      {t("common.cancel")}
                    </Button>
                  )}
                  {device && is_guard_hold_skippable(change.kind) && (
                    <Button
                      data-testid={`guard_held_skip_${change.id}`}
                      disabled={busy_id !== null}
                      size="sm"
                      variant="depth"
                      onClick={() => void skip(change)}
                    >
                      {t("guard.held_skip")}
                    </Button>
                  )}
                </span>
              }
            />
          );
        })
      )}
      {step_up.step_up_modal}
    </IslandSection>
  );
}
