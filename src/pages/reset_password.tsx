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
import { useMemo, useState } from "react";
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
  generate_recovery_key,
  encrypt_vault_backup,
  generate_all_recovery_shares,
  clear_recovery_key,
} from "@/services/crypto/recovery_key";
import { EncryptedVault } from "@/services/crypto/key_manager_core";
import { reset_password_with_token } from "@/services/api/recovery";
import {
  generate_recovery_pdf,
  download_recovery_text,
} from "@/services/crypto/recovery_pdf";
import {
  validate_password_strength,
  timing_safe_delay,
} from "@/services/sanitize";
import {
  EyeIcon,
  EyeSlashIcon,
  InputWithEndContent,
  Logo,
} from "@/components/auth/auth_styles";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";

type ResetStep =
  | "password"
  | "processing"
  | "new_codes"
  | "success"
  | "invalid";

const page_variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

const page_transition = { duration: 0.2, ease: "easeOut" };

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

export default function ResetPasswordPage() {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const is_dark = theme === "dark";
  const [search_params] = useSearchParams();

  const token = useMemo(
    () => (search_params.get("token") || "").trim(),
    [search_params],
  );

  const [step, set_step] = useState<ResetStep>(token ? "password" : "invalid");
  const [password, set_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [is_password_visible, set_is_password_visible] = useState(false);
  const [is_confirm_visible, set_is_confirm_visible] = useState(false);
  const [error, set_error] = useState("");
  const [processing_status, set_processing_status] = useState("");
  const [new_recovery_codes, set_new_recovery_codes] = useState<string[]>([]);
  const [is_key_visible, set_is_key_visible] = useState(false);
  const [copy_success, set_copy_success] = useState(false);

  const handle_submit = async () => {
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

    if (!token) {
      set_step("invalid");

      return;
    }

    set_step("processing");
    set_processing_status(t("auth.generating_new_encryption_keys"));

    try {
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const { hash: password_hash, salt: password_salt } =
        await derive_password_hash(password, salt);

      const placeholder_email = "user@local";
      const display_name = "User";

      const new_identity_keypair = await generate_identity_keypair(
        display_name,
        placeholder_email,
        password,
      );

      const { keypair: new_prekey_keypair, signature: prekey_signature } =
        await generate_signed_prekey(
          display_name,
          placeholder_email,
          password,
          new_identity_keypair.secret_key,
        );

      const pgp_key_data = await prepare_pgp_key_data(
        new_identity_keypair,
        password,
      );

      set_processing_status(t("auth.creating_new_recovery_codes"));
      const new_codes = generate_recovery_codes(6);

      set_new_recovery_codes(new_codes);

      const fresh_vault: EncryptedVault = {
        identity_key: new_identity_keypair.secret_key,
        previous_keys: [],
        signed_prekey: new_prekey_keypair.public_key,
        signed_prekey_private: new_prekey_keypair.secret_key,
        recovery_codes: new_codes,
      };

      set_processing_status(t("auth.encrypting_vault_new_password"));
      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        fresh_vault,
        password,
      );

      set_processing_status(t("auth.creating_new_recovery_backup"));
      const new_recovery_key = generate_recovery_key();
      const new_backup = await encrypt_vault_backup(
        fresh_vault,
        new_recovery_key,
      );
      const new_shares = await generate_all_recovery_shares(
        new_codes,
        new_recovery_key,
      );

      clear_recovery_key(new_recovery_key);

      set_processing_status(t("auth.resetting_password"));
      const response = await reset_password_with_token(
        token,
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
      );

      if (response.error || !response.data?.success) {
        if (
          response.code === "UNAUTHORIZED" ||
          response.code === "FORBIDDEN" ||
          response.code === "NOT_FOUND"
        ) {
          set_step("invalid");

          return;
        }
        throw new Error(response.error || t("auth.recovery_failed"));
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
    await generate_recovery_pdf("reset", new_recovery_codes);
  };

  const handle_download_txt = async () => {
    await download_recovery_text("reset", new_recovery_codes);
  };

  const render_step_content = () => {
    switch (step) {
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
              {t("auth.reset_your_password")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.reset_choose_new_password")}
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
                onKeyDown={(e) => e["key"] === "Enter" && handle_submit()}
              />
            </div>

            <Button
              className="w-full mt-6"
              size="xl"
              variant="depth"
              onClick={handle_submit}
            >
              {t("auth.set_new_password")}
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
              {t("auth.resetting_password")}
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

      case "invalid":
        return (
          <motion.div
            key="invalid"
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
              {t("auth.reset_your_password")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.reset_invalid_or_expired")}
            </p>

            <Button
              className="w-full mt-8"
              size="xl"
              variant="depth"
              onClick={() => navigate("/forgot-password")}
            >
              {t("auth.request_new_reset_link")}
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
