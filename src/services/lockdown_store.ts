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
import { get_lockdown_status } from "@/services/api/lockdown";
import { apply_desktop_content_protection } from "@/native/desktop_content_protection";
import {
  safe_local_get,
  safe_local_keys,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";

const LS_KEY = (account_id: string) => `aster:lockdown:${account_id}`;

const lockdown_state = new Map<string, boolean>();

export const LOCKDOWN_CHANGED_EVENT = "astermail:lockdown-changed";

export function is_lockdown_enabled(account_id: string): boolean {
  if (!account_id) return false;
  if (lockdown_state.has(account_id)) return lockdown_state.get(account_id)!;

  return safe_local_get(LS_KEY(account_id)) === "1";
}

export function set_lockdown_enabled(
  account_id: string,
  enabled: boolean,
): void {
  lockdown_state.set(account_id, enabled);
  if (enabled) {
    safe_local_set(LS_KEY(account_id), "1");
  } else {
    safe_local_remove(LS_KEY(account_id));
  }
  window.dispatchEvent(
    new CustomEvent(LOCKDOWN_CHANGED_EVENT, {
      detail: { account_id, enabled },
    }),
  );
  void apply_desktop_content_protection(is_any_lockdown_active());
}

export function is_any_lockdown_active(): boolean {
  for (const [, enabled] of lockdown_state) {
    if (enabled) return true;
  }
  for (const key of safe_local_keys()) {
    if (key.startsWith("aster:lockdown:") && safe_local_get(key) === "1") {
      return true;
    }
  }

  return false;
}

export async function init_lockdown_from_server(
  account_id: string,
): Promise<boolean> {
  const response = await get_lockdown_status();

  if (response.data) {
    set_lockdown_enabled(account_id, response.data.enabled);

    return response.data.enabled;
  }
  const cached = safe_local_get(LS_KEY(account_id));

  if (cached === null && !lockdown_state.has(account_id)) {
    setTimeout(() => init_lockdown_from_server(account_id), 5000);

    return false;
  }

  return lockdown_state.get(account_id) ?? cached === "1";
}
