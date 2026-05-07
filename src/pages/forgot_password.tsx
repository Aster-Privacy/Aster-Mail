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
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@aster/ui";

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
import {
  EyeIcon,
  EyeSlashIcon,
  InputWithEndContent,
  Logo,
} from "@/components/auth/auth_styles";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";

type RecoveryStep =
  | "email"
  | "code"
  | "email_sent"
  | "password"
  | "processing"
  | "new_codes"
  | "success";

const page_variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

const page_transition = {
  duration: 0.2,
  ease: "easeOut",
};

interface AlertProps {
  message: string;
  is_dark: boolean;
}

const Alert = ({ message, is_dark }: AlertProps) => {
  const reduce_motion = use_should_reduce_motion();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="w-full mt-6"
      exit={{ opacity: 0 }}
      initial={reduce_motion ? false : { opacity: 0 }}
      transition={{ duration: reduce_motion ? 0 : 0.15 }}
    >
      <p
        className="text-sm text-center"
        style={{ color: is_dark ? "#f87171" : "#dc2626" }}
      >
        {message}
      </p>
    </motion.div>
  );
};

const CopyIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    viewBox="0 0 24 24"
  >
    <path
      d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PasswordStrengthIndicator = ({ password }: { password: string }) => {
  const { t } = use_i18n();

  const get_strength = () => {
    if (!password) return { level: 0, label: "", color: "", suggestions: [] };

    let score = 0;
    const suggestions: string[] = [];

    if (password.length >= 8) score++;
    else suggestions.push(t("auth.use_8_characters"));

    if (password.length >= 12) score++;
    else if (password.length >= 8)
      suggestions.push(t("auth.try_12_characters"));

    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    else suggestions.push(t("auth.mix_case"));

    if (/[0-9]/.test(password)) score++;
    else suggestions.push(t("auth.add_numbers"));

    if (/[^A-Za-z0-9]/.test(password)) score++;
    else if (score >= 2) suggestions.push(t("auth.add_special_characters"));

    if (score <= 1)
      return {
        level: 1,
        label: t("auth.password_weak"),
        color: "var(--color-danger)",
        suggestions,
      };
    if (score === 2)
      return {
        level: 2,
        label: t("auth.password_fair"),
        color: "var(--color-warning)",
        suggestions,
      };
    if (score === 3)
      return {
        level: 3,
        label: t("auth.password_good"),
        color: "var(--color-success)",
        suggestions,
      };

    return {
      level: 4,
      label: t("auth.password_strong"),
      color: "var(--color-success)",
      suggestions: [],
    };
  };

  const strength = get_strength();

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{
                backgroundColor:
                  i <= strength.level
                    ? strength.color
                    : "var(--border-secondary)",
              }}
            />
          ))}
        </div>
        <span className="text-xs" style={{ color: strength.color }}>
          {strength.label}
        </span>
      </div>
      {strength.suggestions.length > 0 && strength.level < 3 && (
        <p className="text-xs mt-1.5 text-left text-txt-muted">
          {strength.suggestions[0]}
        </p>
      )}
    </div>
  );
};

export default function ForgotPasswordPage() {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const navigate = useNavigate();
  const [search_params] = useSearchParams();
  const { theme } = useTheme();
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

  const email_recovery_validated = useRef(false);

  useEffect(() => {
    const token = search_params.get("email_recovery_token");

    if (!token) return;
    if (email_recovery_validated.current) return;
    email_recovery_validated.current = true;

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

  const render_step_content = () => {
    switch (step) {
      case "email":
        return (
          <motion.div
            key="email"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Logo />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.recover_your_account")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.enter_email_associated")}
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div className={`w-full ${error ? "mt-4" : "mt-6"}`}>
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                autoComplete="username"
                maxLength={55}
                placeholder={t("common.yourname_placeholder")}
                status={error ? "error" : "default"}
                type="text"
                value={username}
                onChange={(e) => {
                  const raw = e.target.value;
                  const at_index = raw.indexOf("@");

                  if (at_index !== -1) {
                    const local = sanitize_username(raw.substring(0, at_index));
                    const domain_part = raw
                      .substring(at_index + 1)
                      .toLowerCase();

                    set_username(local);
                    if (
                      domain_part === "astermail.org" ||
                      domain_part.startsWith("astermail.org")
                    )
                      set_email_domain("astermail.org");
                    else if (
                      domain_part === "aster.cx" ||
                      domain_part.startsWith("aster.cx")
                    )
                      set_email_domain("aster.cx");
                  } else {
                    set_username(sanitize_username(raw));
                  }
                }}
                onKeyDown={(e) => e["key"] === "Enter" && handle_email_next()}
              />
              <div className="relative flex mt-2 aster_input !p-1 !h-auto">
                <div
                  className="absolute top-1 bottom-1 rounded-[8px] transition-all duration-200 ease-out bg-surf-tertiary"
                  style={{
                    width: "calc(50% - 4px)",
                    left:
                      email_domain === "astermail.org" ? "4px" : "calc(50%)",
                  }}
                />
                <button
                  className={`relative flex-1 h-8 rounded-[8px] text-sm font-medium transition-colors duration-150 ${email_domain === "astermail.org" ? "text-txt-primary" : "text-txt-muted"}`}
                  type="button"
                  onClick={() => set_email_domain("astermail.org")}
                >
                  @astermail.org
                </button>
                <button
                  className={`relative flex-1 h-8 rounded-[8px] text-sm font-medium transition-colors duration-150 ${email_domain === "aster.cx" ? "text-txt-primary" : "text-txt-muted"}`}
                  type="button"
                  onClick={() => set_email_domain("aster.cx")}
                >
                  @aster.cx
                </button>
              </div>
            </div>

            <Button
              className="w-full mt-6"
              size="xl"
              variant="depth"
              onClick={handle_email_next}
            >
              {t("common.continue")}
            </Button>

            <Button
              className="w-full mt-3"
              size="xl"
              variant="secondary"
              onClick={() => navigate("/sign-in")}
            >
              {t("auth.back_to_sign_in")}
            </Button>
          </motion.div>
        );

      case "email_sent":
        return (
          <motion.div
            key="email_sent"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Logo />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.recovery_email_sent")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.recovery_email_sent_desc")}
            </p>

            <Button
              className="w-full mt-8"
              size="xl"
              variant="secondary"
              onClick={() => {
                set_error("");
                set_step("code");
              }}
            >
              {t("auth.use_recovery_code")}
            </Button>
          </motion.div>
        );

      case "code":
        return (
          <motion.div
            key="code"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Logo />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.enter_recovery_code")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.enter_recovery_code_desc")}
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div className={`w-full ${error ? "mt-4" : "mt-6"}`}>
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                autoComplete="off"
                className="font-mono tracking-wider"
                placeholder="ASTER-XXXX-XXXX-XXXX"
                status={error ? "error" : "default"}
                type="text"
                value={recovery_code}
                onChange={(e) =>
                  set_recovery_code(e.target.value.toUpperCase())
                }
                onKeyDown={(e) => e["key"] === "Enter" && handle_code_submit()}
              />
            </div>

            <Button
              className="w-full mt-6"
              size="xl"
              variant="depth"
              onClick={handle_code_submit}
            >
              {t("auth.verify_code")}
            </Button>

            <Button
              className="w-full mt-3"
              size="xl"
              variant="secondary"
              onClick={() => {
                set_error("");
                set_step("email");
              }}
            >
              {t("common.back")}
            </Button>
          </motion.div>
        );

      case "password":
        return (
          <motion.div
            key="password"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Logo />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.create_new_password")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.choose_strong_password")}
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div className={`w-full ${error ? "mt-4" : "mt-6"} space-y-4`}>
              <div>
                <InputWithEndContent
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  autoComplete="new-password"
                  end_content={
                    <button
                      className="focus:outline-none flex items-center justify-center"
                      type="button"
                      onClick={() =>
                        set_is_password_visible(!is_password_visible)
                      }
                    >
                      {is_password_visible ? <EyeSlashIcon /> : <EyeIcon />}
                    </button>
                  }
                  maxLength={128}
                  placeholder={t("auth.new_password_placeholder")}
                  status={error ? "error" : "default"}
                  type={is_password_visible ? "text" : "password"}
                  value={password}
                  onChange={(e) => set_password(e.target.value)}
                />
                <PasswordStrengthIndicator password={password} />
              </div>

              <InputWithEndContent
                autoComplete="new-password"
                end_content={
                  <button
                    className="focus:outline-none flex items-center justify-center"
                    type="button"
                    onClick={() => set_is_confirm_visible(!is_confirm_visible)}
                  >
                    {is_confirm_visible ? <EyeSlashIcon /> : <EyeIcon />}
                  </button>
                }
                maxLength={128}
                placeholder={t("auth.confirm_password_placeholder")}
                status={error ? "error" : "default"}
                type={is_confirm_visible ? "text" : "password"}
                value={confirm_password}
                onChange={(e) => set_confirm_password(e.target.value)}
                onKeyDown={(e) =>
                  e["key"] === "Enter" && handle_password_submit()
                }
              />
            </div>

            <Button
              className="w-full mt-6"
              size="xl"
              variant="depth"
              onClick={handle_password_submit}
            >
              {t("auth.reset_password")}
            </Button>

            {!is_email_recovery && (
              <Button
                className="w-full mt-3"
                size="xl"
                variant="secondary"
                onClick={() => {
                  set_error("");
                  set_step("code");
                }}
              >
                {t("common.back")}
              </Button>
            )}
          </motion.div>
        );

      case "processing":
        return (
          <motion.div
            key="processing"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Spinner className="h-10 w-10 text-blue-500" size="lg" />

            <h2 className="text-xl font-semibold mt-8 text-txt-primary">
              {t("auth.recovering_your_account")}
            </h2>

            <p className="mt-3 text-sm text-txt-tertiary">
              {processing_status}
            </p>

            <p className="mt-8 text-xs max-w-xs leading-relaxed text-txt-muted">
              {t("auth.please_dont_close")}
            </p>
          </motion.div>
        );

      case "new_codes":
        return (
          <motion.div
            key="new_codes"
            animate="animate"
            className="flex flex-col items-center w-full max-w-md px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Logo />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.save_new_recovery_codes")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.old_codes_invalidated")}
            </p>

            <div className="w-full mt-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-txt-muted">
                  {t("auth.n_recovery_codes", {
                    count: new_recovery_codes.length.toString(),
                  })}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
                    onClick={() => set_is_key_visible(!is_key_visible)}
                  >
                    {is_key_visible ? <EyeSlashIcon /> : <EyeIcon />}
                  </button>
                  <button
                    className="p-1.5 rounded transition-colors hover:opacity-80"
                    style={{
                      color: copy_success
                        ? "var(--color-success)"
                        : "var(--text-muted)",
                    }}
                    onClick={handle_copy_codes}
                  >
                    <CopyIcon />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {new_recovery_codes.map((code, index) => (
                  <div
                    key={index}
                    className="rounded-lg px-3 py-2.5 border text-center bg-surf-tertiary border-edge-secondary"
                  >
                    <span
                      className="text-xs font-mono text-txt-primary"
                      style={{
                        filter: is_key_visible ? "none" : "blur(4px)",
                        userSelect: is_key_visible ? "text" : "none",
                      }}
                    >
                      {code}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Button
              className="w-full mt-6"
              size="xl"
              variant="depth"
              onClick={handle_download_pdf}
            >
              {t("auth.download_key")}
            </Button>

            <Button
              className="w-full mt-3"
              size="xl"
              variant="secondary"
              onClick={handle_download_txt}
            >
              {t("auth.download_as_text")}
            </Button>

            <button
              className="w-full mt-6 text-sm transition-colors hover:opacity-80 text-txt-tertiary"
              onClick={() => set_step("success")}
            >
              {t("auth.continue_without_download")}
            </button>
          </motion.div>
        );

      case "success":
        return (
          <motion.div
            key="success"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(34, 197, 94, 0.1)" }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="var(--color-success)"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M5 13l4 4L19 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.password_reset_successful")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.account_recovered_sign_in")}
            </p>

            <Button
              className="w-full mt-8"
              size="xl"
              variant="depth"
              onClick={() => navigate("/sign-in")}
            >
              {t("auth.sign_in")}
            </Button>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <AnimatePresence mode="wait">{render_step_content()}</AnimatePresence>
      </div>
    </div>
  );
}
