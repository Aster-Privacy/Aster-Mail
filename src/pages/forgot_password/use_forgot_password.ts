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
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import { COPY_FEEDBACK_MS } from "@/constants/timings";
import { useTheme } from "@/contexts/theme_context";
import { use_should_reduce_motion } from "@/provider";
import {
  derive_password_hash,
  generate_recovery_codes,
  encrypt_vault,
  generate_identity_keypair,
  generate_signed_prekey,
  prepare_pgp_key_data,
} from "@/services/crypto/key_manager";
import {
  hash_recovery_code,
  decrypt_recovery_key_with_code,
  decrypt_vault_backup,
  generate_recovery_key,
  encrypt_vault_backup,
  generate_all_recovery_shares,
  clear_recovery_key,
  VaultBackup,
} from "@/services/crypto/recovery_key";
import { EncryptedVault } from "@/services/crypto/key_manager_core";
import {
  MASTER_KEY_VAULT_FORMAT,
  is_master_key_vault,
} from "@/services/crypto/memory_key_store";
import {
  is_valid_recovery_phrase,
  compute_phrase_verifier,
  unwrap_vault_with_phrase,
  RECOVERY_PHRASE_WORD_COUNT,
} from "@/services/crypto/recovery_phrase";
import {
  initiate_recovery,
  complete_recovery,
  forgot_password_email,
  initiate_phrase_recovery,
} from "@/services/api/recovery";
import { store_pending_reencryption } from "@/services/crypto/recovery_reencrypt";
import {
  generate_recovery_pdf,
  download_recovery_text,
} from "@/services/crypto/recovery_pdf";
import {
  sanitize_username,
  validate_password_strength,
  timing_safe_delay,
} from "@/services/sanitize";
import { use_i18n } from "@/lib/i18n/context";
import { RecoveryMethod, RecoveryStep } from "./shared";

export function use_forgot_password() {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const is_dark = theme === "dark";

  const [step, set_step] = useState<RecoveryStep>("email");
  const [email, set_email] = useState("");
  const [username, set_username] = useState("");
  const [email_domain, set_email_domain] = useState<
    "astermail.org" | "aster.cx"
  >("astermail.org");
  const [recovery_code, set_recovery_code] = useState("");
  const [password, set_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [is_password_visible, set_is_password_visible] = useState(false);
  const [is_confirm_visible, set_is_confirm_visible] = useState(false);
  const [error, set_error] = useState("");
  const [processing_status, set_processing_status] = useState("");
  const [new_recovery_codes, set_new_recovery_codes] = useState<string[]>([]);
  const [is_key_visible, set_is_key_visible] = useState(false);
  const [copy_success, set_copy_success] = useState(false);
  const [codes_downloaded, set_codes_downloaded] = useState(false);

  const [recovery_token, set_recovery_token] = useState("");
  const [vault_backup, set_vault_backup] = useState<VaultBackup | null>(null);
  const [code_salt, set_code_salt] = useState("");
  const [encrypted_recovery_key_data, set_encrypted_recovery_key_data] =
    useState<{ encrypted_key: string; nonce: string } | null>(null);

  const [recovery_method, set_recovery_method] =
    useState<RecoveryMethod>("code");
  const [phrase_words, set_phrase_words] = useState<string[]>(
    Array(RECOVERY_PHRASE_WORD_COUNT).fill(""),
  );
  const [phrase_wrap, set_phrase_wrap] = useState<{
    wrapped_vault: string;
    wrap_nonce: string;
    wrap_salt: string;
  } | null>(null);

  const handle_email_next = () => {
    set_error("");
    const clean_username = sanitize_username(username.trim());

    if (!clean_username) {
      set_error(t("errors.invalid_username"));

      return;
    }

    const full_email = `${clean_username}@${email_domain}`;

    set_email(full_email);
    set_step("method_choice");
  };

  const update_phrase_word = (index: number, value: string) => {
    const parts = value.trim().toLowerCase().split(/\s+/).filter(Boolean);

    set_phrase_words((prev) => {
      const next = [...prev];

      if (parts.length > 1) {
        const start_index =
          parts.length >= RECOVERY_PHRASE_WORD_COUNT - index
            ? Math.max(0, RECOVERY_PHRASE_WORD_COUNT - parts.length)
            : index;

        for (
          let i = 0;
          i < parts.length && start_index + i < RECOVERY_PHRASE_WORD_COUNT;
          i++
        ) {
          next[start_index + i] = parts[i];
        }
      } else {
        next[index] = value.replace(/\s/g, "").toLowerCase();
      }

      return next;
    });
  };

  const handle_phrase_submit = async () => {
    set_error("");

    const phrase = phrase_words.map((word) => word.trim()).join(" ");

    if (!is_valid_recovery_phrase(phrase)) {
      set_error(t("auth.phrase_entry_invalid"));

      return;
    }

    if (!email.trim()) {
      set_error(t("auth.please_enter_email_address"));
      set_step("email");

      return;
    }

    set_step("processing");
    set_processing_status(t("auth.recovering_account_data"));

    try {
      const verifier_hash = await compute_phrase_verifier(phrase);
      const response = await initiate_phrase_recovery(
        email.trim().toLowerCase(),
        verifier_hash,
      );

      if (response.error || !response.data) {
        await timing_safe_delay();
        set_error(t("auth.phrase_recovery_failed"));
        set_step("phrase_entry");

        return;
      }

      set_phrase_wrap({
        wrapped_vault: response.data.wrapped_vault,
        wrap_nonce: response.data.wrap_nonce,
        wrap_salt: response.data.wrap_salt,
      });
      set_recovery_token(response.data.recovery_token);

      set_step("password");
    } catch {
      await timing_safe_delay();
      set_error(t("auth.phrase_recovery_failed"));
      set_step("phrase_entry");
    }
  };

  const handle_email_reset_link = async () => {
    set_error("");
    const clean_username = sanitize_username(username.trim());

    if (!clean_username) {
      set_error(t("errors.invalid_username"));

      return;
    }

    set_step("processing");
    set_processing_status(t("auth.sending_reset_link"));

    try {
      await forgot_password_email(clean_username, email_domain);
    } catch {}

    await timing_safe_delay();

    set_step("email_sent");
  };

  const handle_code_submit = async () => {
    set_error("");

    const trimmed_code = recovery_code.toUpperCase().trim();
    const trimmed_email = email.trim().toLowerCase();

    if (!trimmed_email) {
      set_error(t("auth.please_enter_email_address"));
      set_step("email");

      return;
    }

    if (!trimmed_code) {
      set_error(t("auth.please_enter_recovery_code"));

      return;
    }

    if (!trimmed_code.startsWith("ASTER-")) {
      set_error(t("auth.recovery_codes_start_with_aster"));

      return;
    }

    set_step("processing");
    set_processing_status(t("auth.verifying_recovery_code"));

    try {
      const code_hash = await hash_recovery_code(trimmed_code);

      const response = await initiate_recovery(code_hash, trimmed_email);

      if (response.error || !response.data) {
        await timing_safe_delay();
        set_error(response.error || t("auth.invalid_recovery_code"));
        set_step("code");

        return;
      }

      set_vault_backup({
        encrypted_data: response.data.encrypted_vault_backup,
        nonce: response.data.vault_backup_nonce,
        salt: response.data.recovery_key_salt,
      });
      set_code_salt(response.data.code_salt);
      set_encrypted_recovery_key_data({
        encrypted_key: response.data.encrypted_recovery_key,
        nonce: response.data.recovery_key_nonce,
      });
      set_recovery_token(response.data.recovery_token);

      set_step("password");
    } catch {
      await timing_safe_delay();
      set_error(t("auth.recovery_failed"));
      set_step("code");
    }
  };

  const complete_phrase_recovery = async () => {
    if (!phrase_wrap || !recovery_token) {
      set_error(t("auth.recovery_session_expired"));
      set_step("email");

      return;
    }

    set_step("processing");
    set_processing_status(t("auth.decrypting_vault"));

    try {
      const phrase = phrase_words.map((word) => word.trim()).join(" ");
      const vault_json = await unwrap_vault_with_phrase(
        phrase,
        phrase_wrap.wrapped_vault,
        phrase_wrap.wrap_nonce,
        phrase_wrap.wrap_salt,
      );

      if (!vault_json) {
        await timing_safe_delay();
        set_error(t("auth.phrase_recovery_failed"));
        set_step("phrase_entry");

        return;
      }

      let vault: EncryptedVault;

      try {
        vault = JSON.parse(vault_json) as EncryptedVault;
      } catch {
        await timing_safe_delay();
        set_error(t("auth.phrase_recovery_failed"));
        set_step("phrase_entry");

        return;
      }

      const vault_uses_master_key = is_master_key_vault(vault);
      const old_data_kek = vault.data_kek ?? null;
      const old_identity_key = vault.identity_key;

      set_processing_status(t("auth.generating_new_encryption_keys"));
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const { hash: password_hash, salt: password_salt } =
        await derive_password_hash(password, salt);

      const display_name = email.split("@")[0] || "User";

      const new_identity_keypair = await generate_identity_keypair(
        display_name,
        email,
        password,
      );

      const { keypair: new_prekey_keypair, signature: prekey_signature } =
        await generate_signed_prekey(
          display_name,
          email,
          password,
          new_identity_keypair.secret_key,
        );

      const pgp_key_data = await prepare_pgp_key_data(
        new_identity_keypair,
        password,
      );

      if (!vault.previous_keys) {
        vault.previous_keys = [];
      }
      if (
        vault.identity_key &&
        !vault.previous_keys.includes(vault.identity_key)
      ) {
        vault.previous_keys.unshift(vault.identity_key);
      }
      if (vault.previous_keys.length > 10) {
        vault.previous_keys = vault.previous_keys.slice(0, 10);
      }

      vault.identity_key = new_identity_keypair.secret_key;
      vault.signed_prekey = new_prekey_keypair.public_key;
      vault.signed_prekey_private = new_prekey_keypair.secret_key;

      set_processing_status(t("auth.creating_new_recovery_codes"));
      const new_codes = generate_recovery_codes(6);

      set_new_recovery_codes(new_codes);

      vault.recovery_codes = new_codes;

      set_processing_status(t("auth.encrypting_vault_new_password"));
      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        vault,
        password,
      );

      set_processing_status(t("auth.creating_new_recovery_backup"));
      const new_recovery_key = generate_recovery_key();
      const new_backup = await encrypt_vault_backup(vault, new_recovery_key);
      const new_shares = await generate_all_recovery_shares(
        new_codes,
        new_recovery_key,
      );

      clear_recovery_key(new_recovery_key);

      set_processing_status(t("auth.saving_new_credentials"));
      const complete_response = await complete_recovery(
        recovery_token,
        password_hash,
        password_salt,
        encrypted_vault,
        vault_nonce,
        new_shares,
        new_backup.encrypted_data,
        new_backup.nonce,
        new_backup.salt,
        btoa(new_identity_keypair.public_key),
        btoa(new_prekey_keypair.public_key),
        btoa(prekey_signature),
        pgp_key_data,
        vault_uses_master_key ? MASTER_KEY_VAULT_FORMAT : undefined,
      );

      if (complete_response.error || !complete_response.data?.success) {
        throw new Error(complete_response.error || t("auth.recovery_failed"));
      }

      if (!vault_uses_master_key) {
        store_pending_reencryption({
          ...(old_data_kek ? { old_data_kek } : {}),
          old_identity_key,
        });
      }

      set_step("new_codes");
    } catch (err) {
      await timing_safe_delay();
      set_error(err instanceof Error ? err.message : t("auth.recovery_failed"));
      set_step("password");
    }
  };

  const handle_password_submit = async () => {
    set_error("");

    if (!/^[\x20-\x7E]*$/.test(password)) {
      set_error(t("auth.password_invalid_chars"));

      return;
    }

    const password_validation = validate_password_strength(password);

    if (!password_validation.valid) {
      set_error(password_validation.errors[0]);

      return;
    }

    if (password !== confirm_password) {
      set_error(t("auth.passwords_do_not_match_register"));

      return;
    }

    if (recovery_method === "phrase") {
      await complete_phrase_recovery();

      return;
    }

    if (!vault_backup || !encrypted_recovery_key_data || !code_salt) {
      set_error(t("auth.recovery_session_expired"));
      set_step("email");

      return;
    }

    set_step("processing");
    set_processing_status(t("auth.decrypting_vault"));

    try {
      const recovery_key = await decrypt_recovery_key_with_code(
        {
          encrypted_key: encrypted_recovery_key_data.encrypted_key,
          nonce: encrypted_recovery_key_data.nonce,
          salt: code_salt,
        },
        recovery_code.toUpperCase().trim(),
      );

      set_processing_status(t("auth.recovering_account_data"));
      const vault = await decrypt_vault_backup(vault_backup, recovery_key);

      const vault_uses_master_key = is_master_key_vault(vault);
      const old_data_kek = vault.data_kek ?? null;
      const old_identity_key = vault.identity_key;

      set_processing_status(t("auth.generating_new_encryption_keys"));
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const { hash: password_hash, salt: password_salt } =
        await derive_password_hash(password, salt);

      const display_name = email.split("@")[0] || "User";

      const new_identity_keypair = await generate_identity_keypair(
        display_name,
        email,
        password,
      );

      const { keypair: new_prekey_keypair, signature: prekey_signature } =
        await generate_signed_prekey(
          display_name,
          email,
          password,
          new_identity_keypair.secret_key,
        );

      const pgp_key_data = await prepare_pgp_key_data(
        new_identity_keypair,
        password,
      );

      if (!vault.previous_keys) {
        vault.previous_keys = [];
      }
      if (
        vault.identity_key &&
        !vault.previous_keys.includes(vault.identity_key)
      ) {
        vault.previous_keys.unshift(vault.identity_key);
      }

      if (vault.previous_keys.length > 10) {
        vault.previous_keys = vault.previous_keys.slice(0, 10);
      }

      vault.identity_key = new_identity_keypair.secret_key;
      vault.signed_prekey = new_prekey_keypair.public_key;
      vault.signed_prekey_private = new_prekey_keypair.secret_key;

      set_processing_status(t("auth.creating_new_recovery_codes"));
      const new_codes = generate_recovery_codes(6);

      set_new_recovery_codes(new_codes);

      vault.recovery_codes = new_codes;

      set_processing_status(t("auth.encrypting_vault_new_password"));
      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        vault,
        password,
      );

      set_processing_status(t("auth.creating_new_recovery_backup"));
      const new_recovery_key = generate_recovery_key();
      const new_backup = await encrypt_vault_backup(vault, new_recovery_key);
      const new_shares = await generate_all_recovery_shares(
        new_codes,
        new_recovery_key,
      );

      clear_recovery_key(recovery_key);
      clear_recovery_key(new_recovery_key);

      set_processing_status(t("auth.saving_new_credentials"));
      const complete_response = await complete_recovery(
        recovery_token,
        password_hash,
        password_salt,
        encrypted_vault,
        vault_nonce,
        new_shares,
        new_backup.encrypted_data,
        new_backup.nonce,
        new_backup.salt,
        btoa(new_identity_keypair.public_key),
        btoa(new_prekey_keypair.public_key),
        btoa(prekey_signature),
        pgp_key_data,
        vault_uses_master_key ? MASTER_KEY_VAULT_FORMAT : undefined,
      );

      if (complete_response.error || !complete_response.data?.success) {
        throw new Error(complete_response.error || t("auth.recovery_failed"));
      }

      if (!vault_uses_master_key) {
        store_pending_reencryption({
          ...(old_data_kek ? { old_data_kek } : {}),
          old_identity_key,
        });
      }

      set_step("new_codes");
    } catch (err) {
      await timing_safe_delay();
      set_error(err instanceof Error ? err.message : t("auth.recovery_failed"));
      set_step("password");
    }
  };

  const handle_copy_codes = async () => {
    const codes_text = new_recovery_codes.join("\n");

    try {
      await navigator.clipboard.writeText(codes_text);
      set_copy_success(true);
      setTimeout(() => set_copy_success(false), COPY_FEEDBACK_MS);
    } catch {}
  };

  const handle_download_pdf = async () => {
    await generate_recovery_pdf(email, new_recovery_codes, t);
    set_codes_downloaded(true);
  };

  const handle_download_txt = async () => {
    await download_recovery_text(email, new_recovery_codes, t);
    set_codes_downloaded(true);
  };

  return {
    t,
    reduce_motion,
    navigate,
    is_dark,
    step,
    set_step,
    email,
    username,
    set_username,
    email_domain,
    set_email_domain,
    recovery_code,
    set_recovery_code,
    password,
    set_password,
    confirm_password,
    set_confirm_password,
    is_password_visible,
    set_is_password_visible,
    is_confirm_visible,
    set_is_confirm_visible,
    error,
    set_error,
    processing_status,
    new_recovery_codes,
    set_new_recovery_codes,
    is_key_visible,
    set_is_key_visible,
    copy_success,
    codes_downloaded,
    recovery_method,
    set_recovery_method,
    phrase_words,
    handle_email_next,
    update_phrase_word,
    handle_phrase_submit,
    handle_email_reset_link,
    handle_code_submit,
    handle_password_submit,
    handle_copy_codes,
    handle_download_pdf,
    handle_download_txt,
  };
}
