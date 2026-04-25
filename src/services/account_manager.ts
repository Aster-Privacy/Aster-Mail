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
  device_store,
  device_retrieve,
} from "@/services/crypto/secure_storage";
import { en } from "@/lib/i18n/translations/en";

const ACCOUNTS_KEY = "astermail_accounts_v6";
const LEGACY_ACCOUNTS_KEY = "astermail_accounts_v5";
const SWITCH_TOKEN_KEY_PREFIX = "astermail_switch_token_";
const SWITCH_TOKEN_EXPIRY_KEY_PREFIX = "astermail_switch_token_exp_";
const DEFAULT_MAX_ACCOUNTS = 3;

export interface User {
  id: string;
  username: string;
  email: string;
  display_name?: string;
  profile_color?: string;
  profile_picture?: string;
}

export interface StoredAccount {
  id: string;
  user: User;
  added_at: number;
}

export interface AccountsData {
  accounts: StoredAccount[];
  current_account_id: string | null;
}

let cached_data: AccountsData | null = null;
let storage_initialized = false;

async function migrate_from_plaintext(): Promise<AccountsData | null> {
  try {
    const legacy_stored = localStorage.getItem(LEGACY_ACCOUNTS_KEY);

    if (legacy_stored) {
      const data = JSON.parse(legacy_stored) as AccountsData;

      if (data && Array.isArray(data.accounts)) {
        await device_store(ACCOUNTS_KEY, data);
        localStorage.removeItem(LEGACY_ACCOUNTS_KEY);

        return data;
      }
    }
  } catch {
    localStorage.removeItem(LEGACY_ACCOUNTS_KEY);
  }

  return null;
}

async function get_accounts_data_async(): Promise<AccountsData> {
  if (cached_data) return cached_data;

  if (!storage_initialized) {
    const migrated = await migrate_from_plaintext();

    if (migrated) {
      cached_data = migrated;
      storage_initialized = true;

      return migrated;
    }

    storage_initialized = true;
  }

  try {
    const data = await device_retrieve<AccountsData>(ACCOUNTS_KEY);

    if (data && Array.isArray(data.accounts)) {
      cached_data = data;

      return data;
    }
  } catch (e) {
    if (import.meta.env.DEV) console.error(e);
  }

  return { accounts: [], current_account_id: null };
}

async function save_accounts_data(data: AccountsData): Promise<void> {
  cached_data = data;
  await device_store(ACCOUNTS_KEY, data);
}

function migrate_legacy_storage(): StoredAccount | null {
  const legacy_user = localStorage.getItem("user");

  localStorage.removeItem("vault");
  localStorage.removeItem("astermail_accounts");
  localStorage.removeItem("astermail_accounts_v2");
  localStorage.removeItem("astermail_accounts_v3");
  localStorage.removeItem("astermail_accounts_v4");
  localStorage.removeItem("auth_token");

  if (legacy_user) {
    try {
      const user = JSON.parse(legacy_user) as User;

      localStorage.removeItem("user");

      return {
        id: user.id,
        user,
        added_at: Date.now(),
      };
    } catch {
      localStorage.removeItem("user");
    }
  }

  return null;
}

export async function initialize_accounts(): Promise<AccountsData> {
  let data = await get_accounts_data_async();

  if (data.accounts.length === 0) {
    const migrated = migrate_legacy_storage();

    if (migrated) {
      data = {
        accounts: [migrated],
        current_account_id: migrated.id,
      };
      await save_accounts_data(data);
    }
  }

  return data;
}

export async function get_all_accounts(): Promise<StoredAccount[]> {
  const data = await get_accounts_data_async();

  return data.accounts;
}

export async function get_current_account(): Promise<StoredAccount | null> {
  const data = await get_accounts_data_async();

  if (!data.current_account_id) return null;

  return data.accounts.find((a) => a.id === data.current_account_id) || null;
}

export async function get_current_account_id(): Promise<string | null> {
  const data = await get_accounts_data_async();

  return data.current_account_id;
}

export async function get_account_count(): Promise<number> {
  const data = await get_accounts_data_async();

  return data.accounts.length;
}

export async function can_add_account(max_accounts?: number): Promise<boolean> {
  const count = await get_account_count();

  return count < (max_accounts ?? DEFAULT_MAX_ACCOUNTS);
}

export async function account_exists(user_id: string): Promise<boolean> {
  const data = await get_accounts_data_async();

  return data.accounts.some((a) => a.id === user_id);
}

export async function add_account(
  user: User,
): Promise<{ success: boolean; error?: string }> {
  const data = await get_accounts_data_async();

  const existing = data.accounts.find((a) => a.id === user.id);

  if (existing) {
    existing.user = user;
    data.current_account_id = user.id;
    await save_accounts_data(data);

    return { success: true };
  }

  if (data.accounts.length >= DEFAULT_MAX_ACCOUNTS) {
    return {
      success: false,
      error: en.errors.max_accounts.replace("{{ max }}", String(DEFAULT_MAX_ACCOUNTS)),
    };
  }

  const new_account: StoredAccount = {
    id: user.id,
    user,
    added_at: Date.now(),
  };

  data.accounts.push(new_account);
  data.current_account_id = user.id;
  await save_accounts_data(data);

  return { success: true };
}

export async function switch_account(
  account_id: string,
): Promise<StoredAccount | null> {
  const data = await get_accounts_data_async();
  const account = data.accounts.find((a) => a.id === account_id);

  if (!account) return null;

  data.current_account_id = account_id;
  await save_accounts_data(data);

  return account;
}

export async function remove_account(
  account_id: string,
): Promise<{ removed: boolean; switched_to: StoredAccount | null }> {
  const data = await get_accounts_data_async();
  const index = data.accounts.findIndex((a) => a.id === account_id);

  if (index === -1) {
    return { removed: false, switched_to: null };
  }

  data.accounts.splice(index, 1);

  let switched_to: StoredAccount | null = null;

  if (data.current_account_id === account_id) {
    if (data.accounts.length > 0) {
      data.current_account_id = data.accounts[0].id;
      switched_to = data.accounts[0];
    } else {
      data.current_account_id = null;
    }
  }

  await save_accounts_data(data);

  return { removed: true, switched_to };
}

export async function update_account_user(
  account_id: string,
  updated_user: User,
): Promise<boolean> {
  const data = await get_accounts_data_async();
  const account = data.accounts.find((a) => a.id === account_id);

  if (!account) return false;

  account.user = updated_user;
  await save_accounts_data(data);

  return true;
}

export async function logout_all(): Promise<void> {
  cached_data = null;
  storage_initialized = false;
  localStorage.removeItem(ACCOUNTS_KEY);
  localStorage.removeItem(LEGACY_ACCOUNTS_KEY);
  localStorage.removeItem("user");
  localStorage.removeItem("vault");
  localStorage.removeItem("auth_token");
  localStorage.removeItem("astermail_accounts");
  localStorage.removeItem("astermail_accounts_v2");
  localStorage.removeItem("astermail_accounts_v3");
  localStorage.removeItem("astermail_accounts_v4");
}

export async function get_other_accounts(): Promise<StoredAccount[]> {
  const data = await get_accounts_data_async();

  return data.accounts.filter((a) => a.id !== data.current_account_id);
}

export function clear_cache(): void {
  cached_data = null;
  storage_initialized = false;
}

export async function store_switch_token(
  account_id: string,
  token: string,
  expires_at: string,
): Promise<void> {
  await device_store(SWITCH_TOKEN_KEY_PREFIX + account_id, {
    token,
    expires_at,
  });
}

export async function get_switch_token(
  account_id: string,
): Promise<string | null> {
  const data = await device_retrieve<{ token: string; expires_at: string }>(
    SWITCH_TOKEN_KEY_PREFIX + account_id,
  );

  if (!data?.token || !data?.expires_at) return null;

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await clear_switch_token(account_id);

    return null;
  }

  return data.token;
}

export async function clear_switch_token(account_id: string): Promise<void> {
  localStorage.removeItem(SWITCH_TOKEN_KEY_PREFIX + account_id);
  localStorage.removeItem(SWITCH_TOKEN_EXPIRY_KEY_PREFIX + account_id);
}

export function clear_all_switch_tokens(): void {
  const keys_to_remove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    if (
      key &&
      (key.startsWith(SWITCH_TOKEN_KEY_PREFIX) ||
        key.startsWith(SWITCH_TOKEN_EXPIRY_KEY_PREFIX))
    ) {
      keys_to_remove.push(key);
    }
  }

  keys_to_remove.forEach((key) => localStorage.removeItem(key));
}
