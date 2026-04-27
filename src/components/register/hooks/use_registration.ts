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
import type { RegistrationStep } from "@/components/register/register_types";

import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { useTheme } from "@/contexts/theme_context";
import { use_auth } from "@/contexts/auth_context";
import { get_default_profile_color } from "@/constants/profile";
import { show_toast } from "@/components/toast/simple_toast";
import {
  hash_email,
  derive_password_hash,
  generate_identity_keypair,
  generate_signed_prekey,
  generate_recovery_codes,
  encrypt_vault,
  prepare_pgp_key_data,
} from "@/services/crypto/key_manager";
import {
  generate_recovery_key,
  encrypt_vault_backup,
  generate_all_recovery_shares,
  clear_recovery_key,
} from "@/services/crypto/recovery_key";
import { register_user } from "@/services/api/auth";
import { request_switch_token } from "@/services/api/switch";
import { store_switch_token } from "@/services/account_manager";
import { check_and_replenish_prekeys } from "@/services/crypto/prekey_service";
import {
  save_recovery_email,
  check_recovery_email_verified,
  resend_recovery_verification,
} from "@/services/api/recovery_email";
import {
  save_preferences,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";
import {
  generate_recovery_pdf,
  download_recovery_text,
} from "@/services/crypto/recovery_pdf";
import {
  sanitize_username,
  validate_password_strength,
  timing_safe_delay,
} from "@/services/sanitize";
import { check_password_breach } from "@/services/breach_check";
import { EMAIL_REGEX } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { prefetch_plans } from "@/components/register/register_step_plan_selection";

export function use_registration() {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const is_dark = theme === "dark";
  const {
    is_adding_account,
    set_is_adding_account,
    is_authenticated,
    is_loading: auth_loading,
    is_completing_registration,
    current_account_id,
    login,
    vault,
    set_is_completing_registration,
  } = use_auth();

  const has_existing_session =
    !auth_loading &&
    is_authenticated &&
    !!current_account_id &&
    !is_adding_account &&
    !is_completing_registration &&
    !location.state?.from;

  useEffect(() => {
    document.title = `${t("auth.sign_up")} | ${t("common.aster_mail")}`;
    prefetch_plans();
  }, []);

  const [step, set_step] = useState<RegistrationStep>("welcome");
  const [is_password_visible, set_is_password_visible] = useState(false);
  const [is_confirm_password_visible, set_is_confirm_password_visible] =
    useState(false);
  const [is_key_visible, set_is_key_visible] = useState(false);
  const [username, set_username] = useState("");
  const [display_name, set_display_name] = useState("");
  const [email_domain, set_email_domain] = useState<
    "astermail.org" | "aster.cx"
  >("astermail.org");
  const [password, set_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [recovery_email, set_recovery_email] = useState("");
  const [remember_me, set_remember_me] = useState(true);
  const [profile_color, set_profile_color] = useState(
    get_default_profile_color,
  );
  const [error, set_error] = useState("");
  const [is_abuse_blocked, set_is_abuse_blocked] = useState(false);
  const [password_breach_warning, set_password_breach_warning] =
    useState(false);
  const [generation_status, set_generation_status] = useState("");
  const [recovery_codes, set_recovery_codes] = useState<string[]>([]);
  const [generated_email, set_generated_email] = useState("");
  const [is_pdf_downloaded, set_is_pdf_downloaded] = useState(false);
  const [is_text_downloaded, set_is_text_downloaded] = useState(false);
  const [captcha_token, set_captcha_token] = useState("");
  const [show_skip_confirmation, set_show_skip_confirmation] = useState(false);
  const [is_saving_recovery_email, set_is_saving_recovery_email] =
    useState(false);
  const [recovery_email_error, set_recovery_email_error] = useState("");
  const [is_resending_verification, set_is_resending_verification] =
    useState(false);
  const [resend_cooldown, set_resend_cooldown] = useState(0);
  const [is_email_verified, set_is_email_verified] = useState(false);
  const [recovery_email_required, set_recovery_email_required] =
    useState(false);
  const verification_poll_ref = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const resend_cooldown_ref = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const complete_registration_ref = useRef<() => Promise<void>>();

  useEffect(() => {
    if (has_existing_session) {
      navigate("/", { replace: true });
    }
  }, [has_existing_session, navigate]);

  const handle_cancel_add_account = () => {
    set_is_adding_account(false);
    navigate("/");
  };

  const RESERVED_USERNAMES = new Set([
    "noreply",
    "admin",
    "administrator",
    "postmaster",
    "webmaster",
    "support",
    "abuse",
    "mailer",
    "daemon",
    "root",
    "hostmaster",
    "info",
    "contact",
    "help",
    "system",
    "mail",
  ]);

  const parse_local_part = (val: string) =>
    val.includes("@") ? val.substring(0, val.indexOf("@")) : val;

  const validate_email_step = async (): Promise<boolean> => {
    const trimmed_username = sanitize_username(parse_local_part(username));

    if (trimmed_username.length < 3) {
      await timing_safe_delay();
      set_error(t("auth.username_min_length"));

      return false;
    }
    if (trimmed_username.length > 40) {
      await timing_safe_delay();
      set_error(t("auth.username_max_length"));

      return false;
    }
    if (!/^[a-z0-9]+$/.test(trimmed_username)) {
      await timing_safe_delay();
      set_error(t("auth.username_alphanumeric"));

      return false;
    }
    if (RESERVED_USERNAMES.has(trimmed_username)) {
      await timing_safe_delay();
      set_error(t("auth.username_not_available"));

      return false;
    }

    return true;
  };

  const validate_password_step = async (): Promise<boolean> => {
    const password_validation = validate_password_strength(password);

    if (!password_validation.valid) {
      await timing_safe_delay();
      set_error(password_validation.errors[0]);

      return false;
    }
    if (password.length > 128) {
      await timing_safe_delay();
      set_error(t("auth.password_max_length_register"));

      return false;
    }
    if (password !== confirm_password) {
      await timing_safe_delay();
      set_error(t("auth.passwords_do_not_match_register"));

      return false;
    }

    return true;
  };

  const handle_password_blur = async () => {
    if (password.length >= 8) {
      const result = await check_password_breach(password);

      set_password_breach_warning(result.is_breached);
    }
  };

  const handle_email_next = async () => {
    set_error("");
    if (await validate_email_step()) {
      set_step("password");
    }
  };

  const registration_promise_ref = useRef<Promise<void> | null>(null);
  const registration_done_ref = useRef(false);

  const handle_password_next = async () => {
    set_error("");
    if (await validate_password_step()) {
      registration_done_ref.current = false;
      registration_promise_ref.current = start_registration_background();
      set_step("generating");
    }
  };

  const yield_to_ui = () =>
    new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );

  const start_registration_background = async () => {
    const clean_username = sanitize_username(parse_local_part(username));
    const email = `${clean_username}@${email_domain}`;

    set_generated_email(email);

    try {
      set_generation_status(t("auth.generating_encryption_keys"));
      await yield_to_ui();
      const user_hash = await hash_email(email);
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const { hash: password_hash, salt: password_salt } =
        await derive_password_hash(password, salt);

      set_generation_status(t("auth.creating_identity_keypair"));
      await yield_to_ui();
      const identity_keypair = await generate_identity_keypair(
        clean_username,
        email,
        password,
      );

      set_generation_status(t("auth.creating_signed_prekey"));
      await yield_to_ui();
      const { keypair: signed_prekey, signature } =
        await generate_signed_prekey(
          clean_username,
          email,
          password,
          identity_keypair.secret_key,
        );

      set_generation_status(t("auth.generating_recovery_codes"));
      await yield_to_ui();
      const codes = generate_recovery_codes(6);

      set_recovery_codes(codes);

      set_generation_status(t("auth.encrypting_key_vault"));
      await yield_to_ui();
      const vault_data = {
        identity_key: identity_keypair.secret_key,
        signed_prekey: signed_prekey.public_key,
        signed_prekey_private: signed_prekey.secret_key,
        recovery_codes: codes,
      };
      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        vault_data,
        password,
      );

      set_generation_status(t("auth.creating_recovery_backup"));
      await yield_to_ui();
      const recovery_key = generate_recovery_key();
      const vault_backup = await encrypt_vault_backup(vault_data, recovery_key);
      const recovery_shares = await generate_all_recovery_shares(
        codes,
        recovery_key,
      );

      clear_recovery_key(recovery_key);

      set_generation_status(t("auth.preparing_pgp_key"));
      await yield_to_ui();
      const pgp_key_data = await prepare_pgp_key_data(
        identity_keypair,
        password,
      );

      set_generation_status(t("auth.creating_your_account"));
      await yield_to_ui();
      const trimmed_display_name = display_name.trim();
      const response = await register_user({
        username: clean_username,
        display_name: trimmed_display_name || undefined,
        profile_color,
        email_domain,
        user_hash,
        password_hash,
        password_salt,
        argon2_params: { memory: 65536, iterations: 3, parallelism: 4 },
        identity_key: btoa(identity_keypair.public_key),
        signed_prekey: btoa(signed_prekey.public_key),
        signed_prekey_signature: btoa(signature),
        encrypted_vault,
        vault_nonce,
        remember_me,
        encrypted_vault_backup: vault_backup.encrypted_data,
        vault_backup_nonce: vault_backup.nonce,
        recovery_key_salt: vault_backup.salt,
        recovery_shares,
        pgp_key: pgp_key_data,
        captcha_token: captcha_token || undefined,
        referral_code:
          new URLSearchParams(window.location.search).get("ref") || undefined,
      });

      if (response.error) {
        await timing_safe_delay();
        if (response.code === "ABUSE_ACCOUNT_LIMIT") {
          set_is_abuse_blocked(true);
        }
        if (response.code === "USERNAME_IN_USE") {
          set_error(t("auth.username_in_use"));
          set_step("email");
          registration_promise_ref.current = null;
          return;
        }
        set_error(response.error);
        set_step("email");
        registration_promise_ref.current = null;

        return;
      }

      if (response.data) {
        if (response.data.recovery_email_required) {
          set_recovery_email_required(true);
        }

        set_is_completing_registration(true);
        await login(
          {
            id: response.data.user_id,
            username: response.data.username,
            email: response.data.email,
            display_name: trimmed_display_name || undefined,
            profile_color,
          },
          vault_data,
          password,
          encrypted_vault,
          vault_nonce,
        );

        if (is_adding_account) {
          try {
            const token_response = await request_switch_token();

            if (token_response.data) {
              await store_switch_token(
                response.data.user_id,
                token_response.data.switch_token,
                token_response.data.expires_at,
              );
            }
          } catch (e) {
            if (import.meta.env.DEV) console.error(e);
          }
        }

        check_and_replenish_prekeys();
      }

      registration_done_ref.current = true;
      set_step((current) =>
        current === "generating" ? "recovery_key" : current,
      );
    } catch (err) {
      await timing_safe_delay();
      set_error(
        err instanceof Error ? err.message : t("auth.registration_failed"),
      );
      set_step("email");
      registration_promise_ref.current = null;
    }
  };

  const handle_copy_codes = async () => {
    const codes_text = recovery_codes.join("\n");

    try {
      await navigator.clipboard.writeText(codes_text);
      show_toast(t("auth.recovery_codes_copied"), "success");
    } catch {}
  };

  const handle_copy_single_code = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      show_toast(t("auth.recovery_code_copied"), "success");
    } catch {}
  };

  const handle_download_key = async () => {
    await generate_recovery_pdf(generated_email, recovery_codes);
    set_is_pdf_downloaded(true);
  };

  const handle_download_txt = async () => {
    await download_recovery_text(generated_email, recovery_codes);
    set_is_text_downloaded(true);
  };

  const validate_email = (email_value: string): boolean => {
    return EMAIL_REGEX.test(email_value);
  };

  const finalize_registration = async () => {
    document.getElementById("initial-loader")?.remove();
    localStorage.setItem("show_onboarding", "true");

    if (vault) {
      try {
        await save_preferences(
          {
            ...DEFAULT_PREFERENCES,
            profile_color,
            theme: theme as "light" | "dark",
          },
          vault,
        );
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
      }
    }

    set_is_completing_registration(false);

    navigate("/");
  };

  const complete_registration = async () => {
    set_step("plan_selection");
  };

  complete_registration_ref.current = complete_registration;

  const stop_verification_polling = useCallback(() => {
    if (verification_poll_ref.current) {
      clearInterval(verification_poll_ref.current);
      verification_poll_ref.current = null;
    }
  }, []);

  const stop_resend_cooldown = useCallback(() => {
    if (resend_cooldown_ref.current) {
      clearInterval(resend_cooldown_ref.current);
      resend_cooldown_ref.current = null;
    }
    set_resend_cooldown(0);
  }, []);

  const start_verification_polling = useCallback(() => {
    stop_verification_polling();
    set_is_email_verified(false);

    verification_poll_ref.current = setInterval(async () => {
      const verified = await check_recovery_email_verified();

      if (verified) {
        set_is_email_verified(true);
        stop_verification_polling();
        setTimeout(() => {
          complete_registration_ref.current?.();
        }, 1500);
      }
    }, 5000);
  }, [stop_verification_polling]);

  const start_resend_cooldown = useCallback(() => {
    stop_resend_cooldown();
    set_resend_cooldown(60);

    resend_cooldown_ref.current = setInterval(() => {
      set_resend_cooldown((prev) => {
        if (prev <= 1) {
          if (resend_cooldown_ref.current) {
            clearInterval(resend_cooldown_ref.current);
            resend_cooldown_ref.current = null;
          }

          return 0;
        }

        return prev - 1;
      });
    }, 1000);
  }, [stop_resend_cooldown]);

  const handle_resend_verification = useCallback(async () => {
    if (resend_cooldown > 0 || is_resending_verification) return;

    set_is_resending_verification(true);
    await resend_recovery_verification(recovery_email.trim());
    set_is_resending_verification(false);
    start_resend_cooldown();
    show_toast(t("common.verification_email_sent"), "success");
  }, [
    resend_cooldown,
    is_resending_verification,
    recovery_email,
    start_resend_cooldown,
    t,
  ]);

  const handle_skip_verification = useCallback(() => {
    if (recovery_email_required) return;
    stop_verification_polling();
    stop_resend_cooldown();
    complete_registration();
  }, [
    stop_verification_polling,
    stop_resend_cooldown,
    recovery_email_required,
  ]);

  useEffect(() => {
    if (step !== "recovery_email_verification") {
      stop_verification_polling();
      stop_resend_cooldown();
    }
  }, [step, stop_verification_polling, stop_resend_cooldown]);

  useEffect(() => {
    return () => {
      stop_verification_polling();
      stop_resend_cooldown();
    };
  }, [stop_verification_polling, stop_resend_cooldown]);

  const handle_recovery_email_continue = async () => {
    set_recovery_email_error("");

    if (!recovery_email.trim()) {
      set_recovery_email_error(t("auth.please_enter_recovery_email"));

      return;
    }

    if (!validate_email(recovery_email.trim())) {
      set_recovery_email_error(t("auth.please_enter_valid_email"));

      return;
    }

    if (vault) {
      set_is_saving_recovery_email(true);
      try {
        const result = await save_recovery_email(recovery_email.trim(), vault);

        if (result.code === "CONFLICT") {
          set_recovery_email_error(t("auth.recovery_email_conflict"));
          set_is_saving_recovery_email(false);

          return;
        }

        if (!result.data.success) {
          set_recovery_email_error(t("auth.failed_save_recovery_email"));
          set_is_saving_recovery_email(false);

          return;
        }
      } catch {
        set_recovery_email_error(t("auth.failed_save_recovery_email"));
        set_is_saving_recovery_email(false);

        return;
      }
      set_is_saving_recovery_email(false);
    }

    set_step("recovery_email_verification");
    start_verification_polling();
    start_resend_cooldown();
  };

  const handle_recovery_email_skip = async () => {
    if (recovery_email_required) return;
    await complete_registration();
  };

  return {
    t,
    is_dark,
    is_adding_account,
    is_authenticated,
    auth_loading,
    has_existing_session,

    step,
    set_step,
    is_password_visible,
    set_is_password_visible,
    is_confirm_password_visible,
    set_is_confirm_password_visible,
    is_key_visible,
    set_is_key_visible,
    username,
    set_username,
    display_name,
    set_display_name,
    email_domain,
    set_email_domain,
    password,
    set_password: (val: string) => {
      set_password(val);
      set_password_breach_warning(false);
    },
    confirm_password,
    set_confirm_password,
    recovery_email,
    set_recovery_email,
    remember_me,
    set_remember_me,
    profile_color,
    set_profile_color,
    error,
    set_error,
    is_abuse_blocked,
    password_breach_warning,
    handle_password_blur,
    generation_status,
    recovery_codes,
    generated_email,
    captcha_token,
    set_captcha_token,
    is_pdf_downloaded,
    is_text_downloaded,
    show_skip_confirmation,
    set_show_skip_confirmation,
    is_saving_recovery_email,
    recovery_email_error,
    set_recovery_email_error,
    is_resending_verification,
    resend_cooldown,
    is_email_verified,
    recovery_email_required,

    handle_cancel_add_account,
    handle_email_next,
    handle_password_next,
    handle_copy_codes,
    handle_copy_single_code,
    handle_download_key,
    handle_download_txt,
    handle_recovery_email_continue,
    handle_recovery_email_skip,
    handle_resend_verification,
    handle_skip_verification,

    complete_registration,
    finalize_registration,
  };
}

export type UseRegistrationReturn = ReturnType<typeof use_registration>;
