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
  device_retrieve_strict,
} from "@/services/crypto/secure_storage";
import { api_client } from "@/services/api/client";
import { write_account_index_hint } from "@/lib/account_index_url";
import { get_active_translations } from "@/lib/i18n/translations";
import { ignore_error } from "@/lib/ignore_error";

async function clear_offline_email_cache(): Promise<void> {
  try {
    const { clear_email_cache } = await import(
      "@/services/offline_email_cache"
    );

    await clear_email_cache();
  } catch {
    return;
  }

  try {
    const { clear_search_snapshots } = await import(
      "@/services/search_index_store"
    );

    await clear_search_snapshots();
  } catch {
    return;
  }
}

const ACCOUNTS_KEY = "astermail_accounts_v6";
const LEGACY_ACCOUNTS_KEY = "astermail_accounts_v5";
const SWITCH_TOKEN_KEY_PREFIX = "astermail_switch_token_";
const SWITCH_TOKEN_EXPIRY_KEY_PREFIX = "astermail_switch_token_exp_";
const DEFAULT_MAX_ACCOUNTS = 6;
const PLAN_FLAG_REPAIR_KEY = "astermail_plan_flags_repaired_v1";

type RosterLoadFailure = "none" | "unavailable" | "undecryptable";

let last_load_failed = false;
let load_failure: RosterLoadFailure = "none";
let session_roster: AccountsData | null = null;

export interface User {
  id: string;
  username: string;
  email: string;
  display_name?: string;
  profile_color?: string;
  profile_picture?: string;
  is_paid_plan?: boolean;
}

export interface StoredAccount {
  id: string;
  user: User;
  added_at: number;
  kind?: "personal" | "shared";
  access_token?: string;
  refresh_token?: string;
}

export interface AccountsData {
  accounts: StoredAccount[];
  current_account_id: string | null;
}

let cached_data: AccountsData | null = null;
let storage_initialized = false;

function is_undecryptable_error(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;

  return code === "wrong_password" || code === "tampered";
}

function repair_current_account_id(data: AccountsData): boolean {
  if (data.accounts.length === 0) {
    if (data.current_account_id === null) return false;
    data.current_account_id = null;

    return true;
  }

  const resolved = data.accounts.some((a) => a.id === data.current_account_id);

  if (resolved) return false;

  data.current_account_id = data.accounts[0].id;

  return true;
}

function adopt_session_roster(data: AccountsData): boolean {
  if (!session_roster) return false;

  let changed = false;

  for (const account of session_roster.accounts) {
    if (data.accounts.some((a) => a.id === account.id)) continue;
    data.accounts.push(account);
    changed = true;
  }

  const pending_current = session_roster.current_account_id;

  if (
    pending_current &&
    data.current_account_id !== pending_current &&
    data.accounts.some((a) => a.id === pending_current)
  ) {
    data.current_account_id = pending_current;
    changed = true;
  }

  session_roster = null;

  return changed;
}

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
    const data = await device_retrieve_strict<AccountsData>(ACCOUNTS_KEY);

    if (data && Array.isArray(data.accounts)) {
      const merged = adopt_session_roster(data);
      const repaired = repair_current_account_id(data);

      cached_data = data;
      last_load_failed = false;
      load_failure = "none";

      const current_index = data.accounts.findIndex(
        (a) => a.id === data.current_account_id,
      );

      if (current_index !== -1) write_account_index_hint(current_index);

      if (merged || repaired) {
        try {
          await device_store(ACCOUNTS_KEY, data);
        } catch (caught) {
          ignore_error(
            "services/account_manager:get_accounts_data_async",
            caught,
          );
        }
      }

      return data;
    }

    load_failure =
      localStorage.getItem(ACCOUNTS_KEY) !== null ? "undecryptable" : "none";
  } catch (e) {
    if (localStorage.getItem(ACCOUNTS_KEY) === null) {
      load_failure = "none";
    } else {
      load_failure = is_undecryptable_error(e) ? "undecryptable" : "unavailable";
    }
    if (import.meta.env.DEV) console.error(e);
  }

  last_load_failed = load_failure !== "none";

  if (load_failure === "unavailable") {
    if (!session_roster) {
      session_roster = { accounts: [], current_account_id: null };
    }

    return session_roster;
  }

  if (load_failure === "undecryptable") {
    cached_data = { accounts: [], current_account_id: null };

    return cached_data;
  }

  return { accounts: [], current_account_id: null };
}

export function accounts_storage_unreadable(): boolean {
  return last_load_failed;
}

export function accounts_storage_failure(): RosterLoadFailure {
  return load_failure;
}

export async function reset_accounts_storage(): Promise<void> {
  try {
    localStorage.removeItem(ACCOUNTS_KEY);
  } catch (caught) {
    ignore_error("services/account_manager:reset_accounts_storage", caught);
  }

  cached_data = null;
  session_roster = null;
  storage_initialized = true;
  last_load_failed = false;
  load_failure = "none";
}

let account_write_chain: Promise<unknown> = Promise.resolve();

export function serialize_account_write<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const run = account_write_chain.then(operation, operation);

  account_write_chain = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

async function save_accounts_data(data: AccountsData): Promise<void> {
  const current_index = data.accounts.findIndex(
    (a) => a.id === data.current_account_id,
  );

  write_account_index_hint(current_index === -1 ? 0 : current_index);

  if (load_failure === "unavailable") {
    session_roster = data;

    return;
  }

  cached_data = data;

  await device_store(ACCOUNTS_KEY, data);

  session_roster = null;
  last_load_failed = false;
  load_failure = "none";
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

export async function get_personal_account_count(): Promise<number> {
  const data = await get_accounts_data_async();

  return data.accounts.filter((a) => a.kind !== "shared").length;
}

export async function can_add_account(max_accounts?: number): Promise<boolean> {
  const count = await get_personal_account_count();

  return count < (max_accounts ?? DEFAULT_MAX_ACCOUNTS);
}

export async function account_exists(user_id: string): Promise<boolean> {
  const data = await get_accounts_data_async();

  return data.accounts.some((a) => a.id === user_id);
}

function merge_user(base: User, updates: Partial<User>): User {
  const result: User = { ...base };
  const key = <K extends keyof User>(k: K, v: User[K]) => {
    if (v !== undefined) result[k] = v;
  };

  if (updates.id !== undefined) key("id", updates.id);
  if (updates.username !== undefined) key("username", updates.username);
  if (updates.email !== undefined) key("email", updates.email);
  if (updates.display_name !== undefined)
    key("display_name", updates.display_name);
  if (updates.profile_color !== undefined)
    key("profile_color", updates.profile_color);
  if (updates.profile_picture !== undefined)
    key("profile_picture", updates.profile_picture);
  if (updates.is_paid_plan !== undefined)
    key("is_paid_plan", updates.is_paid_plan);

  return result;
}

export async function persist_plan_flag_for_current_account(
  is_paid_plan: boolean,
): Promise<boolean> {
  const account_id = await get_current_account_id();

  if (!account_id) return false;

  return set_account_plan_flag(account_id, is_paid_plan);
}

export async function set_account_plan_flag(
  account_id: string,
  is_paid_plan: boolean,
): Promise<boolean> {
  const data = await get_accounts_data_async();
  const account = data.accounts.find((a) => a.id === account_id);

  if (!account || account.user.is_paid_plan === is_paid_plan) return false;

  account.user = { ...account.user, is_paid_plan };
  await save_accounts_data(data);

  return true;
}

export async function repair_stale_plan_flags(): Promise<boolean> {
  try {
    if (localStorage.getItem(PLAN_FLAG_REPAIR_KEY) === "1") return false;
    localStorage.setItem(PLAN_FLAG_REPAIR_KEY, "1");
  } catch {
    return false;
  }

  const data = await get_accounts_data_async();
  let changed = false;

  for (const account of data.accounts) {
    if (account.id === data.current_account_id) continue;
    if (account.user.is_paid_plan !== true) continue;

    account.user = { ...account.user, is_paid_plan: false };
    changed = true;
  }

  if (changed) await save_accounts_data(data);

  return changed;
}

export async function add_account(
  user: User,
): Promise<{ success: boolean; error?: string }> {
  const data = await get_accounts_data_async();

  const existing = data.accounts.find((a) => a.id === user.id);

  if (existing) {
    existing.user = merge_user(existing.user, user);
    data.current_account_id = user.id;
    await save_accounts_data(data);

    return { success: true };
  }

  const personal_count = data.accounts.filter(
    (a) => a.kind !== "shared",
  ).length;

  if (personal_count >= DEFAULT_MAX_ACCOUNTS) {
    return {
      success: false,
      error: get_active_translations().errors.max_accounts.replace(
        "{{ max }}",
        String(DEFAULT_MAX_ACCOUNTS),
      ),
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

export async function upsert_shared_account(user: User): Promise<void> {
  const data = await get_accounts_data_async();
  const existing = data.accounts.find((a) => a.id === user.id);

  if (existing) {
    existing.user = merge_user(existing.user, user);
    existing.kind = "shared";
  } else {
    data.accounts.push({
      id: user.id,
      user,
      added_at: Date.now(),
      kind: "shared",
    });
  }

  await save_accounts_data(data);
}

export async function remove_stale_shared_accounts(
  granted_ids: string[],
): Promise<string[]> {
  const data = await get_accounts_data_async();
  const granted = new Set(granted_ids);
  const stale = data.accounts.filter(
    (a) =>
      a.kind === "shared" &&
      !granted.has(a.id) &&
      a.id !== data.current_account_id,
  );

  if (stale.length === 0) return [];

  data.accounts = data.accounts.filter((a) => !stale.includes(a));
  await save_accounts_data(data);

  return stale.map((a) => a.id);
}

export async function get_account_kind(
  account_id: string,
): Promise<"personal" | "shared"> {
  const data = await get_accounts_data_async();
  const account = data.accounts.find((a) => a.id === account_id);

  return account?.kind === "shared" ? "shared" : "personal";
}

const ACCOUNT_SCOPED_LOCAL_KEYS: readonly string[] = [
  "aster_pref_migrations_done",
  "aster_sidebar_state",
  "aster_crypto_banner_dismissed",
  "aster_family_2fa_banner_dismissed",
  "aster_is_family_plan",
  "aster_has_devices",
  "aster_last_unread_badge",
  "astermail_inbox_categories_enabled",
  "astermail_active_category",
  "astermail_date_format",
  "astermail_time_format",
];

function clear_account_scoped_local_keys(): void {
  for (const key of ACCOUNT_SCOPED_LOCAL_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      return;
    }
  }
}

async function clear_account_scoped_preferences_cache(): Promise<void> {
  clear_account_scoped_local_keys();
  try {
    const { clear_preferences_cache } = await import(
      "@/services/api/preferences"
    );

    clear_preferences_cache();
  } catch {
    return;
  }
}

export async function switch_account(
  account_id: string,
): Promise<StoredAccount | null> {
  const data = await get_accounts_data_async();
  const account = data.accounts.find((a) => a.id === account_id);

  if (!account) return null;

  data.current_account_id = account_id;
  await save_accounts_data(data);
  await clear_offline_email_cache();
  await clear_account_scoped_preferences_cache();

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
  await clear_offline_email_cache();
  await clear_account_scoped_preferences_cache();

  return { removed: true, switched_to };
}

export async function update_account_tokens(
  account_id: string,
  access_token: string | null,
  refresh_token: string | null | undefined,
): Promise<boolean> {
  return serialize_account_write(async () => {
    const data = await get_accounts_data_async();
    const account = data.accounts.find((a) => a.id === account_id);

    if (!account) return false;

    const persist_access = api_client.can_persist_session();

    if (access_token === null || !persist_access) {
      delete account.access_token;
    } else {
      account.access_token = access_token;
    }

    if (refresh_token === null) {
      delete account.refresh_token;
    } else if (refresh_token !== undefined) {
      account.refresh_token = refresh_token;
    }

    await save_accounts_data(data);

    return true;
  });
}

export async function get_account_tokens(
  account_id: string,
): Promise<{ access_token: string | null; refresh_token: string | null }> {
  const data = await get_accounts_data_async();
  const account = data.accounts.find((a) => a.id === account_id);

  if (!account) return { access_token: null, refresh_token: null };

  return {
    access_token: account.access_token ?? null,
    refresh_token: account.refresh_token ?? null,
  };
}

export async function update_account_user(
  account_id: string,
  updated_user: User,
): Promise<boolean> {
  const data = await get_accounts_data_async();
  const account = data.accounts.find((a) => a.id === account_id);

  if (!account) return false;

  account.user = merge_user(account.user, updated_user);
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
  try {
    sessionStorage.clear();
  } catch (caught) {
    ignore_error("services/account_manager:logout_all", caught);
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();

      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (caught) {
    ignore_error("services/account_manager:logout_all", caught);
  }
}

export async function get_other_accounts(): Promise<StoredAccount[]> {
  const data = await get_accounts_data_async();

  return data.accounts.filter((a) => a.id !== data.current_account_id);
}

export function clear_cache(): void {
  cached_data = null;
  storage_initialized = false;
}

export async function reload_accounts_from_storage(): Promise<void> {
  cached_data = null;
  await get_accounts_data_async();
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
