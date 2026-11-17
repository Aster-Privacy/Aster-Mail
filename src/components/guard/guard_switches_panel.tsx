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
import type { GuardJoinPending } from "@/services/guard/guard_join";
import type { GuardSelection } from "@/components/guard/guard_setup_wizard";

import { useCallback, useEffect, useRef, useState } from "react";
import { SettingNote } from "@aster/ui";

import { GuardSwitchRows } from "@/components/guard/guard_setup_wizard";
import { format_guard_time } from "@/components/guard/guard_waiting_screen";
import { use_guard_step_up } from "@/components/guard/use_guard_step_up";
import { show_toast } from "@/components/toast/simple_toast";
import { Button } from "@/components/ui/button";
import { GUARD_ACTION, switches_subject } from "@/lib/crypto/guard_action";
import { use_i18n } from "@/lib/i18n/context";
import { GUARD_SWITCH, put_guard_switches } from "@/services/api/guard";
import { cancel_held_change } from "@/services/guard/guard_changes";
import { get_guard_device } from "@/services/guard/guard_device";
import {
  abandon_guard_join,
  finish_guard_join,
  poll_guard_join,
  start_guard_join,
} from "@/services/guard/guard_join";
import { sign_guard_action } from "@/services/guard/sign_action";

export const GUARD_JOIN_POLL_MS = 2000;

export interface GuardHeldOff {
  id: string;
  apply_after: string;
}

export function held_switch_off(status: GuardStatus): GuardHeldOff | null {
  const change = status.pending_changes.find(
    (item) => item.kind === "guard_switches_off",
  );

  return change ? { id: change.id, apply_after: change.apply_after } : null;
}

export function turns_any_on(
  current: GuardSelection,
  next: GuardSelection,
): boolean {
  return (
    (next.switches & ~current.switches) !== 0 ||
    (next.hold_scopes & ~current.hold_scopes) !== 0
  );
}

export function use_guard_device(user_id: string | null, version: unknown) {
  const [device, set_device] = useState<GuardDevice | null>(null);
  const [checked, set_checked] = useState(false);

  useEffect(() => {
    let alive = true;

    if (!user_id) {
      set_device(null);
      set_checked(true);

      return;
    }
    get_guard_device(user_id)
      .catch(() => null)
      .then((found) => {
        if (!alive) return;
        set_device(found);
        set_checked(true);
      });

    return () => {
      alive = false;
    };
  }, [user_id, version]);

  return { device, checked };
}

interface GuardSwitchesPanelProps {
  user_id: string;
  status: GuardStatus;
  device: GuardDevice | null;
  on_refresh: () => void;
}

export function GuardSwitchesPanel({
  user_id,
  status,
  device,
  on_refresh,
}: GuardSwitchesPanelProps) {
  const { t } = use_i18n();
  const step_up = use_guard_step_up();
  const [busy, set_busy] = useState(false);
  const [held_off, set_held_off] = useState<GuardHeldOff | null>(null);
  const [join, set_join] = useState<GuardJoinPending | null>(null);
  const [join_failed, set_join_failed] = useState(false);
  const join_ref = useRef<GuardJoinPending | null>(null);
  const is_approver = !!device && !!status.this_device;
  const shown_held = held_off ?? held_switch_off(status);
  const selection: GuardSelection = {
    switches: status.switches,
    hold_scopes: status.hold_scopes,
  };

  const apply = async (next: GuardSelection) => {
    if (!device || !is_approver || busy) return;
    set_busy(true);
    try {
      const needs_proof = turns_any_on(selection, next);
      const proof = needs_proof ? await step_up.request_proof() : null;

      if (needs_proof && !proof) return;
      const action = await sign_guard_action(
        device,
        user_id,
        GUARD_ACTION.switches,
        switches_subject(next.switches, next.hold_scopes),
        proof,
      );
      const response = await put_guard_switches({ ...next, action });

      if (response.held) {
        set_held_off({
          id: response.held.id,
          apply_after: response.held.apply_after,
        });
      } else if (response.error) {
        show_toast(t("guard.switches_error"), "error");
      }
      on_refresh();
    } catch {
      show_toast(t("guard.switches_error"), "error");
    } finally {
      set_busy(false);
    }
  };

  const cancel_held = async () => {
    if (!device || !shown_held) return;
    try {
      const proof = await step_up.request_proof();

      if (!proof) return;
      const response = await cancel_held_change(
        device,
        user_id,
        shown_held.id,
        proof,
      );

      if (response.error) {
        show_toast(t("guard.switches_error"), "error");

        return;
      }
      set_held_off(null);
      on_refresh();
    } catch {
      show_toast(t("guard.switches_error"), "error");
    }
  };

  const begin_join = useCallback(async () => {
    set_join_failed(false);
    const started = await start_guard_join(user_id);

    if (started.kind !== "pending") {
      set_join_failed(true);

      return;
    }
    join_ref.current = started.join;
    set_join(started.join);
  }, [user_id]);

  useEffect(() => {
    if (!join) return;
    let alive = true;
    let running = false;
    const stop = (failed: boolean) => {
      window.clearInterval(timer);
      join_ref.current = null;
      set_join(null);
      if (failed) set_join_failed(true);
    };
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const state = await poll_guard_join(join.request_id);

        if (!alive || !state) return;
        if (state === "approved") {
          window.clearInterval(timer);
          const finished = await finish_guard_join(join);

          if (!alive) return;
          stop(finished.kind !== "joined");
          if (finished.kind === "joined") {
            show_toast(t("guard.switches_joined"), "success");
            on_refresh();
          }
        } else if (state === "denied" || state === "expired") {
          stop(true);
          void abandon_guard_join(user_id);
        }
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(() => void tick(), GUARD_JOIN_POLL_MS);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [join, on_refresh, t, user_id]);

  useEffect(
    () => () => {
      if (join_ref.current) void abandon_guard_join(user_id);
    },
    [user_id],
  );

  const recovery_wait_on = (status.switches & GUARD_SWITCH.recovery_wait) !== 0;

  return (
    <>
      {status.paused_until && (
        <div className="px-4 py-3">
          <SettingNote tone="warning">
            {t("guard.switches_paused_until", {
              time: format_guard_time(status.paused_until),
            })}
          </SettingNote>
        </div>
      )}
      {recovery_wait_on && !status.recovery_wait_effective && (
        <div className="px-4 py-3">
          <SettingNote tone="muted">
            {t("guard.switches_recovery_wait_pending")}
          </SettingNote>
        </div>
      )}
      {!status.has_rescue_code && (
        <div className="px-4 py-3">
          <SettingNote tone="warning">
            {t("guard.switches_no_rescue_code")}
          </SettingNote>
        </div>
      )}
      {!is_approver && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          data-testid="guard_not_an_approver"
        >
          <p className="min-w-0 flex-1 text-sm text-txt-muted">
            {t("guard.switches_not_an_approver")}
          </p>
          {join ? (
            <div className="text-end">
              <p className="text-xs text-txt-muted">
                {t("guard.switches_join_waiting")}
              </p>
              <p
                className="text-2xl font-semibold tabular-nums text-txt-primary"
                data-testid="guard_join_number"
              >
                {join.number}
              </p>
            </div>
          ) : (
            <Button
              data-testid="guard_add_this_browser"
              size="sm"
              variant="outline"
              onClick={() => void begin_join()}
            >
              {t("guard.switches_add_this_browser")}
            </Button>
          )}
          {join_failed && (
            <p className="w-full text-sm text-red-500">
              {t("guard.switches_join_failed")}
            </p>
          )}
        </div>
      )}
      <GuardSwitchRows
        disabled={!is_approver || busy}
        disabled_reason={
          is_approver ? undefined : t("guard.switches_locked_reason")
        }
        selection={selection}
        on_change={(next) => void apply(next)}
      />
      {shown_held && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-txt-muted"
          data-testid="guard_switches_held"
        >
          <span>
            {t("guard.switches_turning_off_at", {
              time: format_guard_time(shown_held.apply_after),
            })}
          </span>
          {is_approver && (
            <Button
              data-testid="guard_switches_cancel"
              size="sm"
              variant="outline"
              onClick={() => void cancel_held()}
            >
              {t("common.cancel")}
            </Button>
          )}
        </div>
      )}
      {step_up.step_up_modal}
    </>
  );
}
