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
import { en } from "@/lib/i18n/translations/en";

export interface SyncProgressState {
  status: string;
  processed: number;
  total: number;
  current_folder: string;
}

const POLL_INTERVAL_MS = 1500;

const polling_intervals = new Map<string, ReturnType<typeof setInterval>>();
const progress_state = new Map<string, SyncProgressState>();
const account_token_map = new Map<string, string>();

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

  if (existing) clearInterval(existing);

  account_token_map.set(account_id, account_token);
  notify_listeners();

  const interval = setInterval(async () => {
    try {
      const result = await get_sync_progress(account_token);

      if (!result.data) return;

      progress_state.set(account_id, {
        status: result.data.status,
        processed: result.data.processed_messages,
        total: result.data.total_messages,
        current_folder: result.data.current_folder,
      });
      notify_listeners();

      if (result.data.status === "complete" || result.data.status === "error") {
        clearInterval(interval);
        polling_intervals.delete(account_id);
        account_token_map.delete(account_id);

        window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        window.dispatchEvent(new CustomEvent("astermail:refresh-requested"));
        invalidate_mail_stats();

        if (result.data.status === "complete") {
          if (
            result.data.error_message &&
            result.data.error_message.toLowerCase().includes("quota")
          ) {
            window.dispatchEvent(
              new CustomEvent("astermail:sync-quota-exceeded", {
                detail: result.data.error_message,
              }),
            );
          } else {
            show_toast(en.common.sync_complete, "success");
          }
        } else {
          show_toast(result.data.error_message || en.common.sync_failed, "error");
        }

        setTimeout(() => {
          progress_state.delete(account_id);
          notify_listeners();
        }, 2000);
      }
    } catch {
      clearInterval(interval);
      polling_intervals.delete(account_id);
      account_token_map.delete(account_id);
      progress_state.delete(account_id);
      notify_listeners();
    }
  }, POLL_INTERVAL_MS);

  polling_intervals.set(account_id, interval);
}

export function stop_sync_polling(account_id: string): void {
  const interval = polling_intervals.get(account_id);

  if (interval) {
    clearInterval(interval);
    polling_intervals.delete(account_id);
    account_token_map.delete(account_id);
    progress_state.delete(account_id);
    notify_listeners();
  }
}

export function stop_all_sync_polling(): void {
  polling_intervals.forEach((interval) => clearInterval(interval));
  polling_intervals.clear();
  account_token_map.clear();
  progress_state.clear();
  notify_listeners();
}
