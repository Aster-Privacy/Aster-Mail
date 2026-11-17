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
  GuardRescueStart,
  GuardRescueState,
} from "@/services/api/guard";

import { useEffect, useRef, useState } from "react";

import { GuardResultView } from "@/components/guard/guard_visuals";
import { format_guard_time } from "@/components/guard/guard_waiting_screen";
import { Button } from "@/components/ui/button";
import { use_i18n } from "@/lib/i18n/context";
import { guard_rescue_status } from "@/services/api/guard";
import { GUARD_RESCUE_STORAGE_KEY } from "@/services/guard/guard_rescue_storage";

export { GUARD_RESCUE_STORAGE_KEY };

export const GUARD_SETUP_AFTER_RESCUE_KEY = "aster_guard_setup_after_rescue";
export const GUARD_RESCUE_POLL_MS = 60_000;
export const GUARD_SETUP_AFTER_RESCUE_TTL_MS = 30 * 60_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function local_store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function session_store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function valid_account(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

export function save_guard_rescue(rescue: GuardRescueStart): void {
  if (!UUID_PATTERN.test(rescue.rescue_id)) return;
  try {
    local_store()?.setItem(
      GUARD_RESCUE_STORAGE_KEY,
      JSON.stringify({
        rescue_id: rescue.rescue_id,
        apply_after: rescue.apply_after,
        account_id: valid_account(rescue.account_id),
      }),
    );
  } catch {
    return;
  }
}

export function load_guard_rescue(): GuardRescueStart | null {
  try {
    const raw = local_store()?.getItem(GUARD_RESCUE_STORAGE_KEY);

    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuardRescueStart>;

    if (
      typeof parsed.rescue_id !== "string" ||
      !UUID_PATTERN.test(parsed.rescue_id) ||
      typeof parsed.apply_after !== "string"
    ) {
      return null;
    }

    return {
      rescue_id: parsed.rescue_id,
      apply_after: parsed.apply_after,
      account_id: valid_account(parsed.account_id),
    };
  } catch {
    return null;
  }
}

export function clear_guard_rescue(): void {
  try {
    local_store()?.removeItem(GUARD_RESCUE_STORAGE_KEY);
  } catch {
    return;
  }
}

export function mark_setup_after_rescue(
  account_id: string | null | undefined,
  now: number = Date.now(),
): void {
  try {
    session_store()?.setItem(
      GUARD_SETUP_AFTER_RESCUE_KEY,
      JSON.stringify({ account_id: valid_account(account_id), at: now }),
    );
  } catch {
    return;
  }
}

export function take_setup_after_rescue(
  user_id: string,
  now: number = Date.now(),
): boolean {
  try {
    const store = session_store();
    const raw = store?.getItem(GUARD_SETUP_AFTER_RESCUE_KEY);

    if (!store || !raw) return false;
    store.removeItem(GUARD_SETUP_AFTER_RESCUE_KEY);
    const parsed = JSON.parse(raw) as { account_id?: unknown; at?: unknown };
    const account_id = valid_account(parsed.account_id);

    if (typeof parsed.at !== "number") return false;
    if (now - parsed.at < 0 || now - parsed.at > GUARD_SETUP_AFTER_RESCUE_TTL_MS) {
      return false;
    }

    return account_id === null || account_id === user_id;
  } catch {
    return false;
  }
}

function is_visible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export function use_guard_rescue_status(rescue: GuardRescueStart | null) {
  const [state, set_state] = useState<GuardRescueState>("pending");
  const [apply_after, set_apply_after] = useState(rescue?.apply_after ?? "");
  const last_check = useRef(0);
  const rescue_id = rescue?.rescue_id ?? "";

  useEffect(() => {
    if (!rescue) return;
    save_guard_rescue(rescue);
    set_apply_after(rescue.apply_after);
  }, [rescue]);

  useEffect(() => {
    if (!UUID_PATTERN.test(rescue_id)) return;
    let alive = true;
    let done = false;

    const check = async () => {
      if (done || !is_visible()) return;
      const now = Date.now();

      if (last_check.current && now - last_check.current < GUARD_RESCUE_POLL_MS) {
        return;
      }
      last_check.current = now;
      const response = await guard_rescue_status(rescue_id);

      if (!alive || response.error || !response.data) return;
      const next = response.data.status;

      if (response.data.apply_after) set_apply_after(response.data.apply_after);
      set_state(next);
      if (next !== "pending") {
        done = true;
        clear_guard_rescue();
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), GUARD_RESCUE_POLL_MS);
    const on_visible = () => void check();

    document.addEventListener("visibilitychange", on_visible);

    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", on_visible);
    };
  }, [rescue_id]);

  return { state, apply_after };
}

interface GuardRescueProgressProps {
  rescue: GuardRescueStart | null;
  on_back: () => void;
}

export function GuardRescueProgress({ rescue, on_back }: GuardRescueProgressProps) {
  const { t } = use_i18n();
  const { state, apply_after } = use_guard_rescue_status(rescue);

  if (state === "applied") {
    return (
      <GuardResultView
        actions={
          <Button
            className="w-full"
            data-testid="guard_rescue_sign_in"
            size="lg"
            variant="depth"
            onClick={() => {
              mark_setup_after_rescue(rescue?.account_id);
              on_back();
            }}
          >
            {t("guard.rescue_sign_in")}
          </Button>
        }
        body={t("guard.rescue_applied_body")}
        test_id="guard_rescue_applied"
        title={t("guard.rescue_applied_title")}
      />
    );
  }

  if (state === "vetoed" || state === "cancelled") {
    return (
      <GuardResultView
        actions={
          <Button className="w-full" size="lg" variant="depth" onClick={on_back}>
            {t("guard.sign_in_back")}
          </Button>
        }
        body={t("guard.rescue_stopped_body")}
        test_id="guard_rescue_stopped"
        title={t("guard.rescue_stopped_title")}
      />
    );
  }

  return (
    <GuardResultView
      actions={
        <Button className="w-full" size="lg" variant="depth" onClick={on_back}>
          {t("guard.sign_in_back")}
        </Button>
      }
      body={t("guard.sign_in_rescue_started", {
        date: format_guard_time(apply_after),
      })}
      test_id="guard_rescue_waiting"
      title={t("guard.rescue_waiting_title")}
    />
  );
}
