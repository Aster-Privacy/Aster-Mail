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
import { get_sync_progress } from "@/services/api/external_accounts";
import { show_toast } from "@/components/toast/simple_toast";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { get_active_translations } from "@/lib/i18n/translations";
import { is_low_network } from "@/services/low_network_state";
import { emit_mail_changed, emit_refresh_requested } from "@/hooks/mail_events";

export interface SyncProgressState {
  status: string;
  processed: number;
  total: number;
  current_folder: string;
}

const POLL_INTERVAL_MS = 1500;
// Large first-time imports legitimately run for hours; this is only a
// backstop against an account stuck reporting 'syncing' forever.
const MAX_POLL_DURATION_MS = 4 * 60 * 60 * 1000;
const MAX_CONSECUTIVE_ERRORS = 3;

interface PollingEntry {
  timer: ReturnType<typeof setTimeout>;
  generation: number;
}

const polling_intervals = new Map<string, PollingEntry>();
const progress_state = new Map<string, SyncProgressState>();
const account_token_map = new Map<string, string>();
const max_seen_total = new Map<string, number>();
let next_generation = 0;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify_listeners() {
  listeners.forEach((fn) => fn());
}

export function subscribe_sync_manager(fn: Listener): () => void {
  listeners.add(fn);

  return () => {
    listeners.delete(fn);
  };
}

export function get_all_syncing_ids(): Set<string> {
  return new Set(polling_intervals.keys());
}

export function get_sync_progress_state(
  account_id: string,
): SyncProgressState | undefined {
  return progress_state.get(account_id);
}

export function is_syncing(account_id: string): boolean {
  return polling_intervals.has(account_id);
}

export function start_sync_polling(
  account_id: string,
  account_token: string,
): void {
  const existing = polling_intervals.get(account_id);

  if (existing) clearTimeout(existing.timer);

  next_generation += 1;
  const generation = next_generation;

  account_token_map.set(account_id, account_token);
  max_seen_total.delete(account_id);
  notify_listeners();

  const started_at = Date.now();
  let consecutive_errors = 0;

  const is_current = () =>
    polling_intervals.get(account_id)?.generation === generation;

  const abandon = () => {
    polling_intervals.delete(account_id);
    account_token_map.delete(account_id);
    progress_state.delete(account_id);
    notify_listeners();
  };

  const finish = (
    status: "complete" | "error" | "timeout",
    error_message?: string,
  ) => {
    polling_intervals.delete(account_id);
    account_token_map.delete(account_id);

    emit_mail_changed();
    emit_refresh_requested();
    invalidate_mail_stats();

    const common = get_active_translations().common;

    if (status === "complete") {
      if (error_message?.toLowerCase().includes("quota")) {
        window.dispatchEvent(
          new CustomEvent("astermail:sync-quota-exceeded", {
            detail: error_message,
          }),
        );
      } else {
        show_toast(common.sync_complete, "success");
      }
    } else if (status === "timeout") {
      show_toast(common.sync_timeout, "error");
    } else {
      show_toast(error_message || common.sync_failed, "error");
    }

    setTimeout(() => {
      progress_state.delete(account_id);
      notify_listeners();
    }, 2000);
  };

  const arm = (delay: number) => {
    if (!is_current()) return;

    polling_intervals.set(account_id, {
      timer: setTimeout(tick, delay),
      generation,
    });
  };

  const tick = async () => {
    if (!is_current()) return;

    if (Date.now() - started_at > MAX_POLL_DURATION_MS) {
      finish("timeout");

      return;
    }

    if (is_low_network()) {
      arm(POLL_INTERVAL_MS * 4);

      return;
    }

    try {
      const result = await get_sync_progress(account_token);

      if (!is_current()) return;

      if (!result.data) {
        if (result.error) {
          consecutive_errors += 1;
          if (consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
            abandon();

            return;
          }
        }
        arm(POLL_INTERVAL_MS * 2);

        return;
      }

      consecutive_errors = 0;
      const prev_max = max_seen_total.get(account_id) ?? 0;
      const stable_total = Math.max(result.data.total_messages, prev_max);

      max_seen_total.set(account_id, stable_total);
      progress_state.set(account_id, {
        status: result.data.status,
        processed: result.data.processed_messages,
        total: stable_total,
        current_folder: result.data.current_folder,
      });
      notify_listeners();

      if (result.data.status === "complete" || result.data.status === "error") {
        finish(result.data.status, result.data.error_message ?? undefined);
      } else {
        arm(POLL_INTERVAL_MS);
      }
    } catch {
      if (!is_current()) return;

      consecutive_errors += 1;
      if (consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
        abandon();

        return;
      }
      arm(POLL_INTERVAL_MS * 2);
    }
  };

  polling_intervals.set(account_id, {
    timer: setTimeout(tick, POLL_INTERVAL_MS),
    generation,
  });
}

export function stop_sync_polling(account_id: string): void {
  const entry = polling_intervals.get(account_id);

  if (entry) {
    clearTimeout(entry.timer);
    polling_intervals.delete(account_id);
    account_token_map.delete(account_id);
    progress_state.delete(account_id);
    max_seen_total.delete(account_id);
    notify_listeners();
  }
}

export function stop_all_sync_polling(): void {
  polling_intervals.forEach((entry) => clearTimeout(entry.timer));
  polling_intervals.clear();
  account_token_map.clear();
  progress_state.clear();
  max_seen_total.clear();
  notify_listeners();
}
