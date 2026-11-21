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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { TranslationKey } from "@/lib/i18n/types";
import type { UserPreferences } from "@/services/api/preferences";

import { resolve_password_change_error } from "../password_change_error";

import {
  load_password_change_vault,
  PASSWORD_CHANGE_VAULT_ERROR_KEYS,
} from "./password_change_vault";

import { reprotect_vault_keys_for_password_change } from "@/services/crypto/identity_key_materials";
import { collect_vault_key_fingerprints } from "@/services/crypto/vault_key_fingerprints";
import { change_password, get_user_salt } from "@/services/api/auth";
import { api_client } from "@/services/api/client";
import { compute_password_strength_tier } from "@/services/password_strength_score";
import {
  hash_email,
  derive_password_hash,
  encrypt_vault,
  base64_to_array,
} from "@/services/crypto/key_manager";
import {
  derive_kek_from_password,
  keep_password_change_keks,
} from "@/services/crypto/legacy_keks";
import { mark_keks_for_retirement } from "@/services/crypto/retired_storage_keks";
import {
  get_preferences,
  save_preferences,
  derive_preferences_key_raw,
  derive_dev_mode_key_raw,
  get_dev_mode,
  save_dev_mode,
} from "@/services/api/preferences";
import { reencrypt_all_sent_mail } from "@/services/send_queue_encryption";
import { announce_sent_mail_resealed } from "@/services/sent_mail_reseal";
import { kept_app_lock_field } from "@/services/app_lock_password_change";
import {
  convert_before_password_change,
  sent_mail_needs_password_reseal,
} from "@/services/account_data_conversion";
import { reencrypt_identity_scoped_password_change } from "@/services/crypto/recovery_reencrypt";
import {
  get_vault_from_memory,
  store_vault_in_memory,
  is_master_key_vault,
  MASTER_KEY_VAULT_FORMAT,
} from "@/services/crypto/memory_key_store";
import { upgrade_vault_to_master_key } from "@/services/crypto/vault_master_key_upgrade";
import {
  is_session_passphrase_on_device,
  store_encrypted_vault,
  store_session_passphrase,
} from "@/contexts/auth/session_passphrase";
import { reset_vault_refresh_state } from "@/services/crypto/vault_refresh";
import { with_vault_write_lock } from "@/services/crypto/vault_write_lock";
import { refresh_recovery_backup } from "@/services/crypto/recovery_backup_refresh";
import {
  note_vault_written,
  vault_write_iterations,
  write_vault_at_level,
} from "@/services/crypto/vault_level2";
import { carry_displaced_ratchet_keys } from "@/services/crypto/ratchet_key_continuity";
import {
  generate_auth_salt,
  login_safety_error_key,
} from "@/services/crypto/auth_salt_guard";
import { held_of } from "@/services/guard/held_outcome";
import { ignore_error } from "@/lib/ignore_error";
import { write_locked_sent_mail } from "@/services/locked_sent_mail_store";
import {
  derive_current_account_proof,
  read_kdf_version,
  record_current_account_login_salt,
  user_hash_pin_key,
} from "@/services/crypto/login_proof";

const ERROR_SOURCE =
  "components/settings/hooks/use_security/run_password_change";

export interface PasswordChangeRequest {
  user_id: string;
  user_email: string;
  current_password: string;
  new_password: string;
  preferences: UserPreferences;
  t: (key: TranslationKey) => string;
  on_background_notice: (message: string) => void;
}

export type PasswordChangeResult =
  | { ok: false; held: false; error: string }
  | { ok: false; held: true }
  | {
      ok: true;
      password_strength_tier: ReturnType<typeof compute_password_strength_tier>;
    };

export function append_password_notice(previous: string, message: string) {
  if (previous.includes(message)) return previous;

  return previous ? `${previous} ${message}` : message;
}

export function password_change_failure_message(
  caught: unknown,
  t: (key: TranslationKey) => string,
): string {
  const message = caught instanceof Error ? caught.message : "";

  if (message.startsWith("alias_reencrypt_failed:")) {
    return t("settings.alias_reencrypt_failed");
  }
  if (message.startsWith("contact_reencrypt_failed:")) {
    return t("settings.contact_reencrypt_failed");
  }

  return t(login_safety_error_key(caught) ?? "settings.failed_change_password");
}

export async function run_password_change(
  request: PasswordChangeRequest,
): Promise<PasswordChangeResult> {
  const {
    user_id,
    user_email,
    current_password,
    new_password,
    preferences,
    t,
    on_background_notice,
  } = request;

  const user_hash = await hash_email(user_email);
  const salt_response = await get_user_salt({ user_hash });

  if (salt_response.error || !salt_response.data) {
    return {
      ok: false,
      held: false,
      error: salt_response.error || t("settings.failed_get_auth_data"),
    };
  }

  const salt = base64_to_array(salt_response.data.salt);
  const current_password_hash = await derive_current_account_proof(
    current_password,
    salt,
    read_kdf_version(salt_response.data.kdf_version),
    [user_hash_pin_key(user_hash)],
  );

  let vault!: EncryptedVault;
  let sent_mail_conversion!: Awaited<
    ReturnType<typeof convert_before_password_change>
  >;
  let old_identity_key = "";
  let response!: Awaited<ReturnType<typeof change_password>>;
  let failure = "";
  let change_held = false;
  const password_strength_tier = compute_password_strength_tier(new_password);

  const committed = await with_vault_write_lock(async () => {
    const loaded = await load_password_change_vault(user_id, current_password);

    if (loaded.kind === "error") {
      failure = t(PASSWORD_CHANGE_VAULT_ERROR_KEYS[loaded.reason]);

      return false;
    }

    vault = loaded.vault;
    const cas_field: { expected_vault_sha256?: string } = loaded.server_blob
      ?.vault_sha256
      ? { expected_vault_sha256: loaded.server_blob.vault_sha256 }
      : {};

    const memory_vault = get_vault_from_memory();

    if (!is_master_key_vault(vault) && is_master_key_vault(memory_vault)) {
      vault.data_kek = memory_vault?.data_kek;
      vault.data_kek_random = memory_vault?.data_kek_random;
      vault.storage_rekey = memory_vault?.storage_rekey;
      vault.vault_format = memory_vault?.vault_format;
      vault.mk_created_at = memory_vault?.mk_created_at;
      vault.legacy_identity_keys = memory_vault?.legacy_identity_keys
        ? [...memory_vault.legacy_identity_keys]
        : vault.legacy_identity_keys;
      vault.legacy_keks = memory_vault?.legacy_keks
        ? [...memory_vault.legacy_keks]
        : vault.legacy_keks;
    }

    vault = carry_displaced_ratchet_keys(vault, memory_vault);

    if (
      memory_vault?.ratchet_regen_v4_done &&
      memory_vault.ratchet_identity_public === vault.ratchet_identity_public
    ) {
      vault.ratchet_regen_v4_done = true;
    }

    sent_mail_conversion = await convert_before_password_change({
      identity_key: vault.identity_key,
      passphrase: current_password,
    });

    await upgrade_vault_to_master_key(vault, current_password);

    old_identity_key = vault.identity_key;

    const old_prefs_key_raw =
      await derive_preferences_key_raw(old_identity_key);
    const old_dev_mode_key_raw =
      await derive_dev_mode_key_raw(old_identity_key);

    await reprotect_vault_keys_for_password_change(
      vault,
      current_password,
      new_password,
    );

    const new_salt = generate_auth_salt();
    const {
      hash: new_password_hash,
      salt: new_password_salt,
      hash_v2: new_password_hash_v2,
    } = await derive_password_hash(new_password, new_salt);

    const old_folder_hash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(old_identity_key + "astermail-labels-v1"),
      ),
    );
    const old_tag_hash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(old_identity_key + "astermail-tags-v1"),
      ),
    );
    const retired_raws = [await derive_kek_from_password(current_password)];

    vault.legacy_keks = keep_password_change_keks(vault.legacy_keks, [
      ...retired_raws,
      old_prefs_key_raw,
      old_dev_mode_key_raw,
      old_folder_hash,
      old_tag_hash,
    ]);
    vault.pending_retire_kek_ids = mark_keks_for_retirement(
      vault.pending_retire_kek_ids,
      retired_raws,
      vault.data_kek,
    );

    const vault_key_fingerprints = await collect_vault_key_fingerprints(vault);
    const fingerprint_field = vault_key_fingerprints.length
      ? { vault_key_fingerprints }
      : {};

    const written = await write_vault_at_level(
      vault_write_iterations(),
      (iterations) => encrypt_vault(vault, new_password, iterations),
      (sealed, kdf_field) =>
        change_password({
          current_password_hash,
          new_password_hash,
          new_password_hash_v2,
          new_password_salt,
          new_encrypted_vault: sealed.encrypted_vault,
          new_vault_nonce: sealed.vault_nonce,
          vault_format: MASTER_KEY_VAULT_FORMAT,
          new_password_strength_tier: password_strength_tier,
          ...kdf_field,
          ...kept_app_lock_field(user_id),
          ...fingerprint_field,
          ...cas_field,
        }),
    );

    response = written.response;

    if (held_of(response)) {
      change_held = true;

      return false;
    }

    if (response.error) {
      failure = resolve_password_change_error(
        response.error,
        t,
        response.server_code,
      );

      return false;
    }

    note_vault_written(written.sealed, written.iterations);

    try {
      store_encrypted_vault(
        user_id,
        written.sealed.encrypted_vault,
        written.sealed.vault_nonce,
      );
    } catch (caught) {
      ignore_error(ERROR_SOURCE, caught);
    }

    void record_current_account_login_salt(new_salt);
    reset_vault_refresh_state();
    await store_vault_in_memory(vault, new_password);
    void refresh_recovery_backup(vault, new_password);

    return true;
  });

  if (!committed) {
    if (change_held) return { ok: false, held: true };

    return {
      ok: false,
      held: false,
      error: failure || t("settings.failed_change_password"),
    };
  }

  try {
    await store_session_passphrase(
      user_id,
      new_password,
      is_session_passphrase_on_device(user_id),
    );
  } catch (caught) {
    ignore_error(ERROR_SOURCE, caught);
  }

  if (response.data?.csrf_token) {
    api_client.set_csrf(response.data.csrf_token);
  }
  if (response.data?.access_token) {
    api_client.set_dev_token(
      response.data.access_token,
      response.data.refresh_token,
    );
  }

  try {
    const prefs_result = await get_preferences(vault);

    if (prefs_result.loaded_from_server && !prefs_result.server_blob_unusable) {
      await save_preferences(preferences, vault);
    }
  } catch (caught) {
    ignore_error(ERROR_SOURCE, caught);
  }

  try {
    const dev_mode_result = await get_dev_mode(vault);

    if (dev_mode_result.data !== null) {
      await save_dev_mode(dev_mode_result.data, vault);
    }
  } catch (caught) {
    ignore_error(ERROR_SOURCE, caught);
  }

  const note_reencrypt_failure = (caught: unknown) => {
    on_background_notice(
      t("settings.password_change_background_reencrypt_failed"),
    );
    ignore_error(ERROR_SOURCE, caught);
  };

  sent_mail_needs_password_reseal(sent_mail_conversion)
    .then((needed) =>
      needed ? reencrypt_all_sent_mail(current_password, new_password) : null,
    )
    .then((summary) => {
      if (!summary) return;

      write_locked_sent_mail(user_id, summary.unreadable);
      announce_sent_mail_resealed(summary);

      if (summary.failed > 0) {
        note_reencrypt_failure(
          new Error(`sent mail reseal failed for ${summary.failed} items`),
        );
      }

      if (summary.unreadable > 0) {
        on_background_notice(
          t("settings.password_change_sent_mail_locked").replace(
            "{{count}}",
            String(summary.unreadable),
          ),
        );
      }
    })
    .catch(note_reencrypt_failure);

  reencrypt_identity_scoped_password_change(
    old_identity_key,
    vault.identity_key,
  ).catch(note_reencrypt_failure);

  return { ok: true, password_strength_tier };
}
