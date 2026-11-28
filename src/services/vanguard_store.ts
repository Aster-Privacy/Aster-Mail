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
import { get_vanguard_status } from "@/services/api/vanguard";
import {
  safe_local_get,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";

const KEY = (account_id: string) => `aster:vanguard:${account_id}`;

export function is_vanguard_enabled(account_id: string): boolean {
  return safe_local_get(KEY(account_id)) === "1";
}

export function set_vanguard_enabled(
  account_id: string,
  enabled: boolean,
): void {
  if (enabled) {
    safe_local_set(KEY(account_id), "1");
  } else {
    safe_local_remove(KEY(account_id));
  }
}

export interface VanguardServerState {
  enabled: boolean;
  eligible: boolean | null;
}

export async function load_vanguard_state(
  account_id: string,
): Promise<VanguardServerState> {
  const response = await get_vanguard_status();

  if (response.data) {
    set_vanguard_enabled(account_id, response.data.enabled);

    return {
      enabled: response.data.enabled,
      eligible:
        typeof response.data.eligible === "boolean"
          ? response.data.eligible
          : null,
    };
  }

  return {
    enabled: is_vanguard_enabled(account_id),
    eligible: null,
  };
}
