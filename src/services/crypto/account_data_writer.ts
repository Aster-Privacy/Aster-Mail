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
import type { AccountDataContext } from "./account_data_key";

import { get_account_data_write_key } from "./legacy_keks";
import { wait_for_account_key_load } from "./memory_key_store";

import { get_account_key_capabilities } from "@/services/api/account_key";

export const ACCOUNT_KEY_READ_WAIT_MS = 5000;

export async function account_data_write_key(
  context: AccountDataContext,
): Promise<CryptoKey | null> {
  if (!get_account_data_write_key(context)) return null;

  let enabled = false;

  try {
    enabled = (await get_account_key_capabilities()).format_writes === true;
  } catch {
    return null;
  }

  return enabled ? get_account_data_write_key(context) : null;
}

export async function retry_after_account_key_load<T>(
  attempt: () => Promise<T>,
): Promise<T> {
  try {
    return await attempt();
  } catch (first_error) {
    await wait_for_account_key_load(ACCOUNT_KEY_READ_WAIT_MS);

    try {
      return await attempt();
    } catch {
      throw first_error;
    }
  }
}
