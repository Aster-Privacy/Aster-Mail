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
import {
  safe_local_get,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";
import { device_traces_erased } from "@/lib/device_erase_latch";

export const ERROR_REPORT_CONSENT_KEY = "aster_error_reports";
export const ERROR_REPORT_UNSAVED_DECLINE_KEY = "aster_error_reports_unsaved";

const GRANTED = "on";
const DECLINED = "off";

type DeclineListener = () => void;

const decline_listeners = new Set<DeclineListener>();

let unsaved_decline = false;

function store_choice(value: string): void {
  if (device_traces_erased()) return;
  if (!safe_local_set(ERROR_REPORT_CONSENT_KEY, value)) {
    safe_local_remove(ERROR_REPORT_CONSENT_KEY);
  }
}

function mark_unsaved_decline(pending: boolean): void {
  unsaved_decline = pending;

  if (!pending) {
    safe_local_remove(ERROR_REPORT_UNSAVED_DECLINE_KEY);

    return;
  }
  if (device_traces_erased()) return;

  safe_local_set(ERROR_REPORT_UNSAVED_DECLINE_KEY, "1");
}

export function has_unsaved_error_report_decline(): boolean {
  return (
    unsaved_decline || safe_local_get(ERROR_REPORT_UNSAVED_DECLINE_KEY) === "1"
  );
}

function notify_declined(): void {
  for (const listener of decline_listeners) {
    try {
      listener();
    } catch {
      continue;
    }
  }
}

export function on_error_reports_declined(
  listener: DeclineListener,
): () => void {
  decline_listeners.add(listener);

  return () => {
    decline_listeners.delete(listener);
  };
}

export function has_error_report_consent(): boolean {
  return safe_local_get(ERROR_REPORT_CONSENT_KEY) === GRANTED;
}

export function has_declined_error_reports(): boolean {
  return safe_local_get(ERROR_REPORT_CONSENT_KEY) === DECLINED;
}

export function set_error_report_choice(enabled: boolean): void {
  mark_unsaved_decline(!enabled);

  if (enabled) {
    store_choice(GRANTED);

    return;
  }

  store_choice(DECLINED);
  notify_declined();
}

export function apply_loaded_error_report_preference(enabled: unknown): void {
  if (enabled === false) {
    mark_unsaved_decline(false);
    store_choice(DECLINED);
    notify_declined();

    return;
  }
  if (enabled !== true || has_unsaved_error_report_decline()) return;

  store_choice(GRANTED);
}

export function forget_error_report_grant(): void {
  mark_unsaved_decline(false);

  if (!has_declined_error_reports()) {
    safe_local_remove(ERROR_REPORT_CONSENT_KEY);
  }
  notify_declined();
}
