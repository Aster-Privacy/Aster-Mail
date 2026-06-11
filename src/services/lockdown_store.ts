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

const KEY = (account_id: string) => `aster:lockdown:${account_id}`;

export function is_lockdown_enabled(account_id: string): boolean {
  if (!account_id) return false;
  return localStorage.getItem(KEY(account_id)) === "1";
}

export const LOCKDOWN_CHANGED_EVENT = "astermail:lockdown-changed";

export function set_lockdown_enabled(account_id: string, enabled: boolean): void {
  if (enabled) {
    localStorage.setItem(KEY(account_id), "1");
  } else {
    localStorage.removeItem(KEY(account_id));
  }
  window.dispatchEvent(new CustomEvent(LOCKDOWN_CHANGED_EVENT, { detail: { account_id, enabled } }));
}

export function is_any_lockdown_active(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("aster:lockdown:") && localStorage.getItem(key) === "1") {
      return true;
    }
  }
  return false;
}

export async function init_lockdown_from_server(account_id: string): Promise<boolean> {
  const response = await get_lockdown_status();
  if (response.data) {
    set_lockdown_enabled(account_id, response.data.enabled);
    return response.data.enabled;
  }
  const cached = localStorage.getItem(`aster:lockdown:${account_id}`);
  if (cached === null) {
    setTimeout(() => init_lockdown_from_server(account_id), 5000);
    return false;
  }
  return cached === "1";
}
