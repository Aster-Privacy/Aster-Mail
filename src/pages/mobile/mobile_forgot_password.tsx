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
import type { RecoveryStep } from "./forgot_password/types";

import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { EmailStep } from "./forgot_password/email_step";
import { EmailSentStep } from "./forgot_password/email_sent_step";
import { CodeStep } from "./forgot_password/code_step";
import { PasswordStep } from "./forgot_password/password_step";
import { ProcessingStep } from "./forgot_password/processing_step";
import { NewCodesStep } from "./forgot_password/new_codes_step";
import { SuccessStep } from "./forgot_password/success_step";

import { COPY_FEEDBACK_MS } from "@/constants/timings";
import { useTheme } from "@/contexts/theme_context";
import { use_platform } from "@/hooks/use_platform";
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
import {
  initiate_recovery,
  complete_recovery,
  initiate_email_recovery,
  validate_email_recovery,
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

export default function MobileForgotPasswordPage() {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const [search_params] = useSearchParams();
  const { theme } = useTheme();
  const { safe_area_insets } = use_platform();
  const reduce_motion = use_should_reduce_motion();
  const is_dark = theme === "dark";

  const [step, set_step] = useState<RecoveryStep>("email");
  const [email, set_email] = useState("");
  const [username, set_username] = useState("");
  const [email_domain, set_email_domain] = useState<"astermail.org" | "aster.cx">("astermail.org");
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

  const [recovery_token, set_recovery_token] = useState("");
  const [vault_backup, set_vault_backup] = useState<VaultBackup | null>(null);
  const [code_salt, set_code_salt] = useState("");
  const [encrypted_recovery_key_data, set_encrypted_recovery_key_data] =
    useState<{ encrypted_key: string; nonce: string } | null>(null);
  const [is_email_recovery, set_is_email_recovery] = useState(false);
  const [email_vault_key, set_email_vault_key] = useState<string | null>(null);
  const [recovery_user_email, set_recovery_user_email] = useState("");

  useEffect(() => {
    const token = search_params.get("email_recovery_token");

    if (!token) return;

    set_step("processing");
    set_processing_status(t("auth.validating_recovery_link"));

    validate_email_recovery(token).then(async (response) => {
      if (response.error || !response.data) {
        await timing_safe_delay();
        set_error(t("auth.invalid_recovery_link"));
        set_step("email");

        return;
      }

      set_vault_backup({
        encrypted_data: response.data.encrypted_vault_backup,
        nonce: response.data.vault_backup_nonce,
        salt: response.data.vault_backup_salt,
      });
      set_email_vault_key(response.data.email_vault_key);
      set_recovery_token(response.data.recovery_token);
      set_recovery_user_email(response.data.user_email);
      set_is_email_recovery(true);
      set_step("password");
    });
  }, []);

  const handle_email_next = async () => {
    set_error("");
    const clean_username = sanitize_username(username.trim());

    if (!clean_username) {
      set_error(t("errors.invalid_username"));

      return;
    }

    const full_email = `${clean_username}@${email_domain}`;

    set_email(full_email);
    set_step("processing");
    set_processing_status(t("auth.sending_recovery_email"));

    try {
      const response = await initiate_email_recovery(full_email);

      if (response.error) {
        set_error(response.error);
        set_step("email");

        return;
      }

      set_step("email_sent");
    } catch {
      set_error(t("auth.recovery_failed"));
      set_step("email");
    }
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

    if (!vault_backup) {
      set_error(t("auth.recovery_session_expired"));
      set_step("email");

      return;
    }

    if (!is_email_recovery && (!encrypted_recovery_key_data || !code_salt)) {
      set_error(t("auth.recovery_session_expired"));
      set_step("email");

      return;
    }

    set_step("processing");
    set_processing_status(t("auth.decrypting_vault"));

    try {
      let recovery_key: Uint8Array;

      if (is_email_recovery && email_vault_key) {
        recovery_key = Uint8Array.from(atob(email_vault_key), (c) =>
          c.charCodeAt(0),
        );
      } else {
        recovery_key = await decrypt_recovery_key_with_code(
          {
            encrypted_key: encrypted_recovery_key_data!.encrypted_key,
            nonce: encrypted_recovery_key_data!.nonce,
            salt: code_salt,
          },
          recovery_code.toUpperCase().trim(),
        );
      }

      set_processing_status(t("auth.recovering_account_data"));
      const vault = await decrypt_vault_backup(vault_backup, recovery_key);

      const old_data_kek = vault.data_kek ?? null;
      const old_identity_key = vault.identity_key;

      set_processing_status(t("auth.generating_new_encryption_keys"));
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const { hash: password_hash, salt: password_salt } =
        await derive_password_hash(password, salt);

      const effective_email = is_email_recovery ? recovery_user_email : email;
      const display_name = effective_email.split("@")[0] || "User";

      const new_identity_keypair = await generate_identity_keypair(
        display_name,
        effective_email,
        password,
      );

      const { keypair: new_prekey_keypair, signature: prekey_signature } =
        await generate_signed_prekey(
          display_name,
          effective_email,
          password,
          new_identity_keypair.secret_key,
        );

      const pgp_key_data = await prepare_pgp_key_data(new_identity_keypair, password);

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

      let new_email_backup_data:
        | {
            encrypted_vault_backup: string;
            vault_backup_nonce: string;
            vault_backup_salt: string;
            email_vault_key: string;
          }
        | undefined;

      if (is_email_recovery) {
        const new_email_vault_key = generate_recovery_key();
        const email_backup = await encrypt_vault_backup(
          vault,
          new_email_vault_key,
        );

        new_email_backup_data = {
          encrypted_vault_backup: email_backup.encrypted_data,
          vault_backup_nonce: email_backup.nonce,
          vault_backup_salt: email_backup.salt,
          email_vault_key: btoa(String.fromCharCode(...new_email_vault_key)),
        };
        clear_recovery_key(new_email_vault_key);
      }

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
        new_email_backup_data,
        btoa(new_identity_keypair.public_key),
        btoa(new_prekey_keypair.public_key),
        btoa(prekey_signature),
        pgp_key_data,
      );

      if (complete_response.error || !complete_response.data?.success) {
        throw new Error(complete_response.error || t("auth.recovery_failed"));
      }

      if (old_data_kek) {
        store_pending_reencryption({
          old_data_kek,
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
    await generate_recovery_pdf(email, new_recovery_codes);
  };

  const handle_download_txt = async () => {
    await download_recovery_text(email, new_recovery_codes);
  };

  const navigate_sign_in = () => navigate("/sign-in");

  const render_step = () => {
    switch (step) {
      case "email":
        return (
          <EmailStep
            email_domain={email_domain}
            error={error}
            is_dark={is_dark}
            on_navigate_sign_in={navigate_sign_in}
            on_next={handle_email_next}
            reduce_motion={reduce_motion}
            set_email_domain={set_email_domain}
            set_error={set_error}
            set_step={set_step}
            set_username={set_username}
            username={username}
          />
        );

      case "email_sent":
        return (
          <EmailSentStep
            error={error}
            is_dark={is_dark}
            reduce_motion={reduce_motion}
            set_error={set_error}
            set_step={set_step}
          />
        );

      case "code":
        return (
          <CodeStep
            error={error}
            is_dark={is_dark}
            on_submit={handle_code_submit}
            recovery_code={recovery_code}
            reduce_motion={reduce_motion}
            set_error={set_error}
            set_recovery_code={set_recovery_code}
            set_step={set_step}
          />
        );

      case "password":
        return (
          <PasswordStep
            confirm_password={confirm_password}
            error={error}
            is_confirm_visible={is_confirm_visible}
            is_dark={is_dark}
            is_email_recovery={is_email_recovery}
            is_password_visible={is_password_visible}
            on_submit={handle_password_submit}
            password={password}
            reduce_motion={reduce_motion}
            set_confirm_password={set_confirm_password}
            set_error={set_error}
            set_is_confirm_visible={set_is_confirm_visible}
            set_is_password_visible={set_is_password_visible}
            set_password={set_password}
            set_step={set_step}
          />
        );

      case "processing":
        return (
          <ProcessingStep
            processing_status={processing_status}
            reduce_motion={reduce_motion}
          />
        );

      case "new_codes":
        return (
          <NewCodesStep
            copy_success={copy_success}
            error={error}
            is_dark={is_dark}
            is_key_visible={is_key_visible}
            new_recovery_codes={new_recovery_codes}
            on_copy_codes={handle_copy_codes}
            on_download_pdf={handle_download_pdf}
            on_download_txt={handle_download_txt}
            reduce_motion={reduce_motion}
            set_error={set_error}
            set_is_key_visible={set_is_key_visible}
            set_step={set_step}
          />
        );

      case "success":
        return (
          <SuccessStep
            on_navigate_sign_in={navigate_sign_in}
            reduce_motion={reduce_motion}
          />
        );

      default:
        return null;
    }
  };

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-[100dvh] flex-col bg-[var(--bg-primary)]"
      initial={reduce_motion ? false : { opacity: 0 }}
      style={{
        paddingTop: safe_area_insets.top,
        paddingBottom: safe_area_insets.bottom,
      }}
      transition={{ duration: reduce_motion ? 0 : 0.3 }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          animate={{ opacity: 1 }}
          className="flex flex-1 flex-col"
          exit={reduce_motion ? undefined : { opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {render_step()}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
