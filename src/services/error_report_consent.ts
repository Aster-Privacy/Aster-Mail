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

export const ERROR_REPORT_CONSENT_KEY = "aster_error_reports";

const GRANTED = "on";
const DECLINED = "off";

type DeclineListener = () => void;

const decline_listeners = new Set<DeclineListener>();

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
  if (enabled) {
    if (!safe_local_set(ERROR_REPORT_CONSENT_KEY, GRANTED)) {
      safe_local_remove(ERROR_REPORT_CONSENT_KEY);
    }

    return;
  }

  if (!safe_local_set(ERROR_REPORT_CONSENT_KEY, DECLINED)) {
    safe_local_remove(ERROR_REPORT_CONSENT_KEY);
  }
  notify_declined();
}

export function apply_loaded_error_report_preference(enabled: unknown): void {
  if (enabled === false) {
    set_error_report_choice(false);

    return;
  }
  if (enabled !== true || has_declined_error_reports()) return;

  if (!safe_local_set(ERROR_REPORT_CONSENT_KEY, GRANTED)) {
    safe_local_remove(ERROR_REPORT_CONSENT_KEY);
  }
}

export function forget_error_report_grant(): void {
  if (!has_declined_error_reports()) {
    safe_local_remove(ERROR_REPORT_CONSENT_KEY);
  }
  notify_declined();
}
