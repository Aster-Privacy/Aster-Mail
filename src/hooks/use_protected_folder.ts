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
import type { ApiResponse } from "@/services/api/client/helpers";

import { useState, useCallback, useEffect } from "react";

import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  set_folder_password,
  verify_folder_password,
  change_folder_password,
  remove_folder_password,
  lock_folder_session,
} from "@/services/api/folders";
import {
  clear_all_folder_unlock_records,
  clear_folder_unlock_record,
  get_unlock_token as get_unlock_token_for_folder_label,
  has_folder_unlock_records,
  is_folder_unlock_live,
  list_folder_unlock_records,
  parse_unlock_expiry,
  set_folder_unlock_record,
} from "@/services/folder_unlock_store";
import { purge_locked_folder_local_caches } from "@/services/locked_folders";
import { request_folder_unlock_grant } from "@/services/folder_unlock_grant";
import { api_client } from "@/services/api/client";
import {
  prepare_set_password,
  prepare_change_password,
  derive_password_keys,
  array_to_base64,
  base64_to_array,
  folder_pin_level_after_unlock,
  folder_pin_level_for_write,
  folder_salt_is_current,
  folder_writes_bound,
  open_folder_wrap_for_unlock,
  salt_rule_for_pin,
} from "@/services/crypto/folder_protection";
import { get_stored_key_readiness } from "@/services/api/stored_key_readiness";
import {
  current_folder_key_pin_level,
  record_folder_key_pin,
} from "@/services/crypto/folder_key_pin_vault";
import {
  folder_key_belongs_elsewhere,
  pin_folder_kdf,
  remember_folder_pin,
} from "@/services/crypto/folder_kdf_pin";
import { use_folders } from "@/hooks/use_folders";
import { emit_folders_changed } from "@/hooks/mail_events";
import { use_i18n } from "@/lib/i18n/context";

interface UnlockedFolder {
  folder_id: string;
  folder_token: string;
  folder_key: Uint8Array;
  unlocked_at: number;
  password_salt: string;
  unlock_token: string | null;
  unlock_expires_at: number | null;
  timeout_id: ReturnType<typeof setTimeout> | null;
}

const unlocked_folders = new Map<string, UnlockedFolder>();

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function register_unlock(record: UnlockedFolder): void {
  const previous = unlocked_folders.get(record.folder_id);

  if (previous && previous !== record) {
    if (previous.timeout_id) clearTimeout(previous.timeout_id);
    if (previous.folder_key !== record.folder_key) {
      zero_uint8_array(previous.folder_key);
    }
  }
  unlocked_folders.set(record.folder_id, record);
  set_folder_unlock_record({
    folder_id: record.folder_id,
    folder_token: record.folder_token,
    unlock_token: record.unlock_token,
    unlock_expires_at: record.unlock_expires_at,
  });
}

function revoke_unlock_session(record: UnlockedFolder): void {
  void lock_folder_session(record.folder_id, {
    unlock_token: record.unlock_token,
    all_sessions: false,
  }).catch(() => undefined);
}

function forget_unlock(folder_id: string): void {
  unlocked_folders.delete(folder_id);
  clear_folder_unlock_record(folder_id);
  void purge_locked_folder_local_caches().catch(() => undefined);
}

function clear_folder_timeout(folder_id: string): void {
  const unlocked = unlocked_folders.get(folder_id);

  if (unlocked?.timeout_id) {
    clearTimeout(unlocked.timeout_id);
    unlocked.timeout_id = null;
  }
}

export const FOLDER_LOCKED_EVENT = "astermail:folder-locked";

function dispatch_folder_locked(folder_id: string): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(FOLDER_LOCKED_EVENT, { detail: { folder_id } }),
  );
}

function folder_timeout_delay(record: UnlockedFolder): number {
  if (record.unlock_expires_at === null) return SESSION_TIMEOUT_MS;

  const until_expiry = record.unlock_expires_at - Date.now();

  return Math.max(0, Math.min(SESSION_TIMEOUT_MS, until_expiry));
}

function set_folder_timeout(folder_id: string): void {
  clear_folder_timeout(folder_id);
  const unlocked = unlocked_folders.get(folder_id);

  if (!unlocked) return;

  unlocked.timeout_id = setTimeout(() => {
    lock_folder_by_id(folder_id);
  }, folder_timeout_delay(unlocked));
}

export function lock_folder_by_id(folder_id: string): boolean {
  const unlocked = unlocked_folders.get(folder_id);

  if (!unlocked) {
    if (is_folder_unlock_live(folder_id)) {
      clear_folder_unlock_record(folder_id);
      dispatch_folder_locked(folder_id);

      return true;
    }

    return false;
  }

  clear_folder_timeout(folder_id);
  revoke_unlock_session(unlocked);
  zero_uint8_array(unlocked.folder_key);
  forget_unlock(folder_id);
  dispatch_folder_locked(folder_id);

  return true;
}

export interface UseProtectedFolderResult {
  is_unlocked: boolean;
  is_loading: boolean;
  error: string | null;
  unlock_folder: (password: string) => Promise<boolean>;
  set_password: (password: string) => Promise<boolean>;
  change_password: (
    current_password: string,
    new_password: string,
  ) => Promise<boolean>;
  remove_password: (password: string) => Promise<boolean>;
  lock_folder: () => void;
  get_folder_key: () => Uint8Array | null;
}

export function use_protected_folder(
  folder_id: string,
): UseProtectedFolderResult {
  const { t } = use_i18n();

  const describe_password_error = useCallback(
    (response: ApiResponse<unknown>, fallback: string): string => {
      switch (response.server_code) {
        case "INVALID_TWO_FACTOR_CODE":
          return t("settings.invalid_2fa_code");
        case "TWO_FACTOR_CODE_REQUIRED":
          return t("settings.please_enter_2fa_code");
        case "ACCOUNT_PASSWORD_REQUIRED":
          return t("common.please_enter_password");
        case "FOLDER_PASSWORD_ALREADY_SET":
          return t("common.password_already_set");
        case "FOLDER_PASSWORD_NOT_SET":
          return t("common.folder_no_password_protection");
        default:
          return fallback;
      }
    },
    [t],
  );
  const { get_folder_by_id } = use_folders();
  const folder = get_folder_by_id(folder_id);

  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [is_unlocked, set_is_unlocked] = useState(() =>
    unlocked_folders.has(folder_id),
  );

  useEffect(() => {
    set_is_unlocked(unlocked_folders.has(folder_id));
    set_error(null);
  }, [folder_id]);

  useEffect(() => {
    const handle_folder_locked = (event: Event) => {
      const custom_event = event as CustomEvent<{ folder_id: string }>;

      if (custom_event.detail.folder_id === folder_id) {
        set_is_unlocked(false);
      }
    };

    window.addEventListener(FOLDER_LOCKED_EVENT, handle_folder_locked);

    return () => {
      window.removeEventListener(FOLDER_LOCKED_EVENT, handle_folder_locked);
    };
  }, [folder_id]);

  const reset_timeout = useCallback(() => {
    set_folder_timeout(folder_id);
  }, [folder_id]);

  const unlock_folder = useCallback(
    async (password: string): Promise<boolean> => {
      if (!folder?.is_password_protected || !folder?.password_set) {
        set_error(t("common.folder_no_password_protection"));

        return false;
      }

      set_is_loading(true);
      set_error(null);

      try {
        const folder_response = await api_client.get<{
          password_salt?: string;
        }>(`/mail/v1/labels/${folder_id}`);

        if (folder_response.error || !folder_response.data) {
          set_error(t("common.failed_to_unlock_folder"));

          return false;
        }

        const password_salt = folder_response.data.password_salt;

        if (!password_salt) {
          set_error(t("common.failed_to_unlock_folder"));

          return false;
        }

        const salt = base64_to_array(password_salt);
        const pin_level = current_folder_key_pin_level(folder_id);
        const { auth_key, encryption_key } = await derive_password_keys(
          password,
          salt,
          salt_rule_for_pin(pin_level),
        );

        const verify_response = await verify_folder_password(folder_id, {
          password_hash: array_to_base64(auth_key),
        });

        if (!verify_response.data) {
          zero_uint8_array(encryption_key);
          set_error(
            verify_response.error || t("common.failed_to_unlock_folder"),
          );

          return false;
        }

        if (!verify_response.data.verified) {
          zero_uint8_array(encryption_key);
          set_error(t("errors.wrong_folder_password"));

          return false;
        }

        if (
          !verify_response.data.encrypted_folder_key ||
          !verify_response.data.folder_key_nonce
        ) {
          zero_uint8_array(encryption_key);
          set_error(t("common.failed_to_unlock_folder"));

          return false;
        }

        const encrypted_folder_key = base64_to_array(
          verify_response.data.encrypted_folder_key,
        );
        const folder_key_nonce = base64_to_array(
          verify_response.data.folder_key_nonce,
        );

        const opening = await open_folder_wrap_for_unlock(
          folder_id,
          pin_level,
          verify_response.data.folder_key_version,
          salt,
          encrypted_folder_key,
          folder_key_nonce,
          encryption_key,
        ).finally(() => zero_uint8_array(encryption_key));

        const folder_key = opening.folder_key;

        if (await folder_key_belongs_elsewhere(folder_id, folder_key)) {
          zero_uint8_array(folder_key);
          set_error(t("common.failed_to_unlock_folder"));

          return false;
        }

        let unlocked_salt = password_salt;
        let unlock_token = verify_response.data.unlock_token ?? null;
        let unlock_expires_at = parse_unlock_expiry(
          verify_response.data.unlock_expires_at,
        );

        if (opening.rebind) {
          try {
            const change_data = await prepare_change_password(
              password,
              password,
              password_salt,
              folder_key,
              folder_id,
              pin_level,
              true,
            );
            const rebound = await change_folder_password(
              folder_id,
              change_data,
            );

            if (rebound.error) throw new Error("folder rebind refused");

            const grant = await request_folder_unlock_grant(
              folder_id,
              change_data.new_password_hash,
            );

            if (!grant) throw new Error("folder rebind grant missing");

            unlocked_salt = change_data.new_password_salt;
            unlock_token = grant.unlock_token;
            unlock_expires_at = grant.unlock_expires_at;
          } catch (caught) {
            zero_uint8_array(folder_key);
            throw caught;
          }
        }

        const reached_level = opening.rebind
          ? pin_level
          : folder_pin_level_after_unlock(opening.format, salt);

        if (reached_level > pin_level) {
          void record_folder_key_pin(folder_id, reached_level);
        }

        const salt_is_current = folder_salt_is_current(
          base64_to_array(unlocked_salt),
        );

        if (salt_is_current) {
          pin_folder_kdf(folder_id);
        }

        void remember_folder_pin(folder_id, folder_key, salt_is_current).catch(
          () => false,
        );

        register_unlock({
          folder_id,
          folder_token: folder.folder_token,
          folder_key,
          unlocked_at: Date.now(),
          password_salt: unlocked_salt,
          unlock_token,
          unlock_expires_at,
          timeout_id: null,
        });

        set_is_unlocked(true);
        reset_timeout();
        emit_folders_changed();

        return true;
      } catch {
        set_error(t("common.failed_to_unlock_folder"));

        return false;
      } finally {
        set_is_loading(false);
      }
    },
    [folder_id, folder, reset_timeout, t],
  );

  const set_password = useCallback(
    async (password: string): Promise<boolean> => {
      if (folder?.password_set) {
        set_error(t("common.password_already_set"));

        return false;
      }

      set_is_loading(true);
      set_error(null);

      try {
        const bound = folder_writes_bound(
          current_folder_key_pin_level(folder_id),
          await get_stored_key_readiness(),
        );
        const { data, folder_key } = await prepare_set_password(
          password,
          folder_id,
          bound,
        );

        const response = await set_folder_password(folder_id, data);

        if (response.error) {
          throw new Error(
            describe_password_error(
              response,
              t("common.failed_to_set_folder_password"),
            ),
          );
        }

        void record_folder_key_pin(
          folder_id,
          folder_pin_level_for_write(bound),
        );

        pin_folder_kdf(folder_id);
        void remember_folder_pin(folder_id, folder_key, true).catch(
          () => false,
        );

        const grant = await request_folder_unlock_grant(
          folder_id,
          data.password_hash,
        );

        if (grant) {
          register_unlock({
            folder_id,
            folder_token: folder?.folder_token ?? "",
            folder_key,
            unlocked_at: Date.now(),
            password_salt: data.password_salt,
            unlock_token: grant.unlock_token,
            unlock_expires_at: grant.unlock_expires_at,
            timeout_id: null,
          });
          set_is_unlocked(true);
          reset_timeout();
        } else {
          zero_uint8_array(folder_key);
          set_is_unlocked(false);
        }

        emit_folders_changed();
        void purge_locked_folder_local_caches().catch(() => undefined);

        return true;
      } catch (err) {
        set_error(
          err instanceof Error
            ? err.message
            : t("common.failed_to_set_folder_password"),
        );

        return false;
      } finally {
        set_is_loading(false);
      }
    },
    [folder_id, folder, reset_timeout, t, describe_password_error],
  );

  const change_password_fn = useCallback(
    async (
      current_password: string,
      new_password: string,
    ): Promise<boolean> => {
      const unlocked = unlocked_folders.get(folder_id);

      if (!unlocked) {
        set_error(t("common.folder_must_be_unlocked"));

        return false;
      }

      set_is_loading(true);
      set_error(null);

      try {
        const change_pin_level = current_folder_key_pin_level(folder_id);
        const bound = folder_writes_bound(
          change_pin_level,
          await get_stored_key_readiness(),
        );
        const change_data = await prepare_change_password(
          current_password,
          new_password,
          unlocked.password_salt,
          unlocked.folder_key,
          folder_id,
          change_pin_level,
          bound,
        );

        const response = await change_folder_password(folder_id, change_data);

        if (response.error) {
          throw new Error(
            describe_password_error(
              response,
              t("common.failed_to_change_folder_password"),
            ),
          );
        }

        void record_folder_key_pin(
          folder_id,
          folder_pin_level_for_write(bound),
        );

        pin_folder_kdf(folder_id);
        void remember_folder_pin(folder_id, unlocked.folder_key, true).catch(
          () => false,
        );

        const grant = await request_folder_unlock_grant(
          folder_id,
          change_data.new_password_hash,
        );

        if (!grant) {
          clear_folder_timeout(folder_id);
          zero_uint8_array(unlocked.folder_key);
          forget_unlock(folder_id);
          set_is_unlocked(false);
          dispatch_folder_locked(folder_id);

          return true;
        }

        unlocked.password_salt = change_data.new_password_salt;
        unlocked.unlocked_at = Date.now();
        unlocked.unlock_token = grant.unlock_token;
        unlocked.unlock_expires_at = grant.unlock_expires_at;
        register_unlock(unlocked);
        reset_timeout();

        return true;
      } catch (err) {
        set_error(
          err instanceof Error
            ? err.message
            : t("common.failed_to_change_folder_password"),
        );

        return false;
      } finally {
        set_is_loading(false);
      }
    },
    [folder_id, reset_timeout, t, describe_password_error],
  );

  const remove_password_fn = useCallback(
    async (password: string): Promise<boolean> => {
      const unlocked = unlocked_folders.get(folder_id);

      if (!unlocked) {
        set_error(t("common.folder_must_be_unlocked"));

        return false;
      }

      if (folder?.folder_type === "default_secure") {
        set_error(t("common.cannot_remove_vault_password"));

        return false;
      }

      set_is_loading(true);
      set_error(null);

      try {
        const salt = base64_to_array(unlocked.password_salt);
        const { auth_key } = await derive_password_keys(
          password,
          salt,
          salt_rule_for_pin(current_folder_key_pin_level(folder_id)),
        );

        const response = await remove_folder_password(folder_id, {
          password_hash: array_to_base64(auth_key),
        });

        if (response.error) {
          throw new Error(
            describe_password_error(
              response,
              t("common.failed_to_remove_folder_password"),
            ),
          );
        }

        clear_folder_timeout(folder_id);
        zero_uint8_array(unlocked.folder_key);
        forget_unlock(folder_id);
        set_is_unlocked(false);

        emit_folders_changed();

        return true;
      } catch (err) {
        set_error(
          err instanceof Error
            ? err.message
            : t("common.failed_to_remove_folder_password"),
        );

        return false;
      } finally {
        set_is_loading(false);
      }
    },
    [folder_id, folder, t, describe_password_error],
  );

  const lock_folder = useCallback(() => {
    if (!lock_folder_by_id(folder_id)) dispatch_folder_locked(folder_id);
    set_is_unlocked(false);
  }, [folder_id]);

  const get_folder_key = useCallback((): Uint8Array | null => {
    const unlocked = unlocked_folders.get(folder_id);

    if (unlocked) {
      reset_timeout();

      return unlocked.folder_key;
    }

    return null;
  }, [folder_id, reset_timeout]);

  return {
    is_unlocked,
    is_loading,
    error,
    unlock_folder,
    set_password,
    change_password: change_password_fn,
    remove_password: remove_password_fn,
    lock_folder,
    get_folder_key,
  };
}

export function lock_all_folders(): number {
  const entries = [...unlocked_folders.entries()];
  const record_ids = list_folder_unlock_records().map(
    (record) => record.folder_id,
  );

  unlocked_folders.clear();
  for (const [, unlocked] of entries) {
    if (unlocked.timeout_id) {
      clearTimeout(unlocked.timeout_id);
      unlocked.timeout_id = null;
    }
    revoke_unlock_session(unlocked);
    zero_uint8_array(unlocked.folder_key);
  }
  clear_all_folder_unlock_records();
  void purge_locked_folder_local_caches().catch(() => undefined);

  const locked_ids = new Set<string>([
    ...entries.map(([folder_id]) => folder_id),
    ...record_ids,
  ]);

  for (const folder_id of locked_ids) {
    dispatch_folder_locked(folder_id);
  }

  return locked_ids.size;
}

export function lock_folder_left_behind(
  previous_view: string,
  next_view: string,
): boolean {
  if (previous_view === next_view) return false;
  if (!previous_view.startsWith("folder-")) return false;

  const folder_token = previous_view.slice("folder-".length);
  const folder_ids = new Set<string>();

  for (const unlocked of unlocked_folders.values()) {
    if (unlocked.folder_token === folder_token) {
      folder_ids.add(unlocked.folder_id);
    }
  }
  for (const record of list_folder_unlock_records()) {
    if (record.folder_token === folder_token) folder_ids.add(record.folder_id);
  }

  let locked = false;

  for (const folder_id of folder_ids) {
    if (lock_folder_by_id(folder_id)) locked = true;
  }

  return locked;
}

export function list_unlocked_folder_ids(): string[] {
  return [...unlocked_folders.keys()].filter((folder_id) =>
    is_folder_unlocked(folder_id),
  );
}

export function count_unlocked_folders(): number {
  return list_unlocked_folder_ids().length;
}

export function has_unlocked_folders(): boolean {
  return unlocked_folders.size > 0 || has_folder_unlock_records();
}

export function is_folder_unlocked(folder_id: string): boolean {
  if (!unlocked_folders.has(folder_id)) return false;

  if (!is_folder_unlock_live(folder_id)) {
    const unlocked = unlocked_folders.get(folder_id);

    if (unlocked) {
      if (unlocked.timeout_id) {
        clearTimeout(unlocked.timeout_id);
        unlocked.timeout_id = null;
      }
      zero_uint8_array(unlocked.folder_key);
      unlocked_folders.delete(folder_id);
      queueMicrotask(() => {
        forget_unlock(folder_id);
        dispatch_folder_locked(folder_id);
      });
    }

    return false;
  }

  return true;
}

export function get_unlock_token(label_token: string): string | null {
  return get_unlock_token_for_folder_label(label_token);
}
