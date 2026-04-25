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
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRightIcon, ChevronLeftIcon } from "@heroicons/react/20/solid";

import { use_auth } from "@/contexts/auth_context";
import { api_client } from "@/services/api/client";
import { use_i18n } from "@/lib/i18n/context";
import { useTheme } from "@/contexts/theme_context";
import { use_platform } from "@/hooks/use_platform";
import {
  hash_email,
  derive_password_hash,
  decrypt_vault,
  base64_to_array,
} from "@/services/crypto/key_manager";
import { login_user, get_user_salt, get_user_info } from "@/services/api/auth";
import { check_and_replenish_prekeys } from "@/services/crypto/prekey_service";
import { sanitize_username, timing_safe_delay } from "@/services/sanitize";
import {
  EyeIcon,
  EyeSlashIcon,
  UserCircleIcon,
  LockClosedIcon,
} from "@/components/auth/auth_styles";
import {
  TurnstileWidget,
  type TurnstileWidgetRef,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { use_should_reduce_motion } from "@/provider";
import { TotpVerification } from "@/components/auth/totp_verification";
import { BackupCodeInput } from "@/components/auth/backup_code_input";
import { WebauthnVerification } from "@/components/auth/webauthn_verification";
import {
  is_totp_required_response,
  TotpVerifyResponse,
} from "@/services/api/totp";
import { is_webauthn_supported } from "@/services/api/webauthn";
import { emit_auth_ready } from "@/hooks/mail_events";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_INPUT_WRAPPER_CLASS,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
  DEPTH_SECONDARY_CLASS,
  BACK_BUTTON_CLASS,
  BACK_BUTTON_STYLE,
  LABEL_CLASS,
  INNER_INPUT_WITH_ICON_CLASS,
  INPUT_ICON_CLASS,
} from "@/components/auth/mobile_auth_motion";

export default function MobileSignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { safe_area_insets } = use_platform();
  const {
    login,
    add_account,
    is_adding_account,
    set_is_adding_account,
    is_authenticated,
    is_loading: auth_loading,
    current_account_id,
  } = use_auth();
  const { theme } = useTheme();
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const is_dark = theme === "dark";

  const has_existing_session =
    !auth_loading &&
    is_authenticated &&
    !!current_account_id &&
    !is_adding_account &&
    !location.state?.from;

  const preloaded = useRef(false);

  useEffect(() => {
    document.title = `${t("auth.sign_in")} | ${t("common.aster_mail")}`;
    if (!preloaded.current) {
      preloaded.current = true;
      import("@/pages/mobile/mobile_register").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (has_existing_session) {
      navigate("/", { replace: true });
    } else if (!auth_loading && !current_account_id && !is_adding_account) {
      api_client.clear_session_cookies();
    }
  }, [
    has_existing_session,
    auth_loading,
    current_account_id,
    is_adding_account,
    navigate,
  ]);

  const [is_password_visible, set_is_password_visible] = useState(false);
  const [username, set_username] = useState("");
  const [password, set_password] = useState("");
  const [email_domain, set_email_domain] = useState<
    "astermail.org" | "aster.cx"
  >("astermail.org");
  const [remember_me, set_remember_me] = useState(true);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const [status, set_status] = useState("");

  const [captcha_token, set_captcha_token] = useState("");
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);

  const [totp_required, set_totp_required] = useState(false);
  const [pending_login_token, set_pending_login_token] = useState("");
  const [available_2fa_methods, set_available_2fa_methods] = useState<string[]>(
    [],
  );
  const [active_2fa_method, set_active_2fa_method] = useState<
    "totp" | "webauthn" | "backup" | "choose"
  >("totp");

  const handle_totp_success = useCallback(
    async (totp_response: TotpVerifyResponse) => {
      set_is_loading(true);
      set_status(t("auth.decrypting_vault"));

      try {
        const vault = await decrypt_vault(
          totp_response.encrypted_vault,
          totp_response.vault_nonce,
          password,
        );

        set_status(t("auth.getting_user_info"));
        let user_info_response: Awaited<
          ReturnType<typeof get_user_info>
        > | null = null;

        try {
          user_info_response = await Promise.race([
            get_user_info(),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 10_000),
            ),
          ]);
        } catch {}

        const user_data = user_info_response?.data
          ? {
              id: totp_response.user_id,
              username: totp_response.username,
              email: totp_response.email,
              display_name: user_info_response.data.display_name || undefined,
              profile_color: user_info_response.data.profile_color || undefined,
              profile_picture:
                user_info_response.data.profile_picture || undefined,
            }
          : {
              id: totp_response.user_id,
              username: totp_response.username,
              email: totp_response.email,
            };

        set_status(t("auth.signing_in"));

        const login_timeout = <T,>(promise: Promise<T>): Promise<T> =>
          Promise.race([
            promise,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("login_timeout")), 15_000),
            ),
          ]);

        if (is_adding_account) {
          await login_timeout(
            add_account(
              user_data,
              vault,
              password,
              totp_response.encrypted_vault,
              totp_response.vault_nonce,
              totp_response.switch_token,
              totp_response.switch_token_expires_at,
            ),
          );
        } else {
          await login_timeout(
            login(
              user_data,
              vault,
              password,
              totp_response.encrypted_vault,
              totp_response.vault_nonce,
            ),
          );
        }

        if (totp_response.needs_prekey_replenishment) {
          check_and_replenish_prekeys();
        }

        if (totp_response.is_suspended) {
          sessionStorage.setItem("aster_suspended", "true");
        }

        navigate("/");
        setTimeout(() => emit_auth_ready(), 50);
      } catch (err) {
        if (err instanceof Error && err.message === "login_timeout") {
          navigate("/");
          setTimeout(() => emit_auth_ready(), 50);

          return;
        }
        if (err instanceof Error && err.message.includes("decrypt")) {
          set_error(t("errors.decrypt_failed"));
        } else {
          set_error(
            err instanceof Error ? err.message : t("errors.login_failed"),
          );
        }
        set_is_loading(false);
        set_totp_required(false);
      }
    },
    [password, is_adding_account, add_account, login, navigate, t],
  );

  if (auth_loading || has_existing_session) {
    return null;
  }

  const handle_cancel_add_account = () => {
    set_is_adding_account(false);
    navigate("/");
  };

  const handle_totp_cancel = () => {
    set_totp_required(false);
    set_pending_login_token("");
    set_available_2fa_methods([]);
    set_active_2fa_method("totp");
    set_password("");
  };

  const handle_login = async () => {
    set_error("");

    const raw_local = username.includes("@")
      ? username.substring(0, username.indexOf("@"))
      : username;
    const typed_domain = username.includes("@")
      ? username.substring(username.indexOf("@") + 1).toLowerCase()
      : "";
    const clean_username = sanitize_username(raw_local);
    const final_domain =
      typed_domain === "astermail.org" || typed_domain === "aster.cx"
        ? typed_domain
        : email_domain;

    if (
      !clean_username ||
      clean_username.length < 3 ||
      clean_username.length > 40
    ) {
      await timing_safe_delay();
      set_error(t("errors.invalid_username"));

      return;
    }

    if (!password || password.length < 1) {
      await timing_safe_delay();
      set_error(t("errors.enter_password"));

      return;
    }

    if (password.length > 128) {
      await timing_safe_delay();
      set_error(t("errors.password_too_long"));

      return;
    }

    set_is_loading(true);
    set_status(t("auth.authenticating"));

    const email = `${clean_username}@${final_domain}`;
    const start_time = Date.now();

    try {
      const user_hash = await hash_email(email);

      set_status(t("auth.fetching_auth_data"));
      const salt_response = await get_user_salt({ user_hash });

      if (salt_response.error || !salt_response.data) {
        const elapsed = Date.now() - start_time;
        const min_time = 500;

        if (elapsed < min_time) {
          await new Promise((resolve) =>
            setTimeout(resolve, min_time - elapsed),
          );
        }
        set_error(salt_response.error || t("errors.account_not_found"));
        set_is_loading(false);
        set_captcha_token("");
        turnstile_ref.current?.reset();

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash: password_hash } = await derive_password_hash(
        password,
        salt,
      );

      set_status(t("auth.verifying_credentials"));
      const response = await login_user({
        user_hash,
        password_hash,
        remember_me,
        captcha_token: captcha_token || undefined,
      });

      if (response.error) {
        const elapsed = Date.now() - start_time;
        const min_time = 1000;

        if (elapsed < min_time) {
          await new Promise((resolve) =>
            setTimeout(resolve, min_time - elapsed),
          );
        }
        if (response.code === "RATE_LIMIT_EXCEEDED" && response.resets_at) {
          const reset_time = new Date(response.resets_at).getTime();
          const minutes = Math.ceil((reset_time - Date.now()) / 60000);
          const time_str = minutes > 0 ? `${minutes}m` : t("errors.try_again");

          set_error(t("errors.ip_blocked", { time: time_str }));
        } else {
          set_error(response.error);
        }
        set_is_loading(false);
        set_captcha_token("");
        turnstile_ref.current?.reset();

        return;
      }

      if (!response.data) {
        await timing_safe_delay();
        set_error(t("errors.login_failed"));
        set_is_loading(false);
        set_captcha_token("");
        turnstile_ref.current?.reset();

        return;
      }

      if (is_totp_required_response(response.data)) {
        set_pending_login_token(response.data.pending_login_token);
        const methods = response.data.available_methods || ["totp"];

        set_available_2fa_methods(methods);
        if (methods.length === 1) {
          set_active_2fa_method(
            methods[0] === "webauthn" && is_webauthn_supported()
              ? "webauthn"
              : "totp",
          );
        } else if (methods.includes("webauthn") && is_webauthn_supported()) {
          set_active_2fa_method("webauthn");
        } else {
          set_active_2fa_method("totp");
        }
        set_totp_required(true);
        set_is_loading(false);

        return;
      }

      set_status(t("auth.decrypting_vault"));
      const vault = await decrypt_vault(
        response.data.encrypted_vault,
        response.data.vault_nonce,
        password,
      );

      set_status(t("auth.getting_user_info"));
      let user_info_response: Awaited<ReturnType<typeof get_user_info>> | null =
        null;

      try {
        user_info_response = await Promise.race([
          get_user_info(),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 10_000),
          ),
        ]);
      } catch {}

      const login_user_data = user_info_response?.data
        ? {
            id: response.data.user_id,
            username: response.data.username,
            email: response.data.email,
            display_name: user_info_response.data.display_name || undefined,
            profile_color: user_info_response.data.profile_color || undefined,
            profile_picture:
              user_info_response.data.profile_picture || undefined,
          }
        : {
            id: response.data.user_id,
            username: response.data.username,
            email: response.data.email,
          };

      set_status(t("auth.signing_in"));

      const login_timeout = <T,>(promise: Promise<T>): Promise<T> =>
        Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("login_timeout")), 15_000),
          ),
        ]);

      if (is_adding_account) {
        await login_timeout(
          add_account(
            login_user_data,
            vault,
            password,
            response.data.encrypted_vault,
            response.data.vault_nonce,
            response.data.switch_token,
            response.data.switch_token_expires_at,
          ),
        );
      } else {
        await login_timeout(
          login(
            login_user_data,
            vault,
            password,
            response.data.encrypted_vault,
            response.data.vault_nonce,
          ),
        );
      }

      if (response.data.needs_prekey_replenishment) {
        check_and_replenish_prekeys();
      }

      if (response.data.is_suspended) {
        sessionStorage.setItem("aster_suspended", "true");
      }

      navigate("/");
      setTimeout(() => emit_auth_ready(), 50);
    } catch (err) {
      if (err instanceof Error && err.message === "login_timeout") {
        navigate("/");
        setTimeout(() => emit_auth_ready(), 50);

        return;
      }
      const elapsed = Date.now() - start_time;
      const min_time = 1000;

      if (elapsed < min_time) {
        await new Promise((resolve) => setTimeout(resolve, min_time - elapsed));
      }
      if (err instanceof Error && err.message.includes("decrypt")) {
        set_error(t("errors.decrypt_failed"));
      } else {
        set_error(
          err instanceof Error ? err.message : t("errors.login_failed"),
        );
      }
      set_is_loading(false);
      set_captcha_token("");
      turnstile_ref.current?.reset();
    }
  };

  if (totp_required) {
    return (
      <div
        className="flex h-[100dvh] flex-col bg-[var(--bg-primary)]"
        style={{
          paddingTop: safe_area_insets.top,
          paddingBottom: safe_area_insets.bottom,
        }}
      >
        <div className="shrink-0 px-6 pt-4 pb-2">
          <motion.button
            className="flex items-center justify-center text-[var(--text-secondary)]"
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={handle_totp_cancel}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                d="M15 19l-7-7 7-7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <AnimatePresence mode="wait">
            {is_loading ? (
              <div className="flex flex-col items-center gap-4 text-center">
                <Spinner className="h-8 w-8 text-[#4a7aff]" size="lg" />
                <p className="text-sm text-[var(--text-secondary)]">{status}</p>
              </div>
            ) : active_2fa_method === "backup" ? (
              <BackupCodeInput
                on_cancel={handle_totp_cancel}
                on_success={handle_totp_success}
                on_use_authenticator={() =>
                  set_active_2fa_method(
                    available_2fa_methods.includes("totp")
                      ? "totp"
                      : "webauthn",
                  )
                }
                pending_login_token={pending_login_token}
              />
            ) : active_2fa_method === "webauthn" ? (
              <WebauthnVerification
                on_cancel={handle_totp_cancel}
                on_success={handle_totp_success}
                on_use_other_method={() =>
                  set_active_2fa_method(
                    available_2fa_methods.includes("totp") ? "totp" : "backup",
                  )
                }
                pending_login_token={pending_login_token}
              />
            ) : (
              <TotpVerification
                on_cancel={handle_totp_cancel}
                on_success={handle_totp_success}
                on_use_backup_code={() => set_active_2fa_method("backup")}
                pending_login_token={pending_login_token}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-[100dvh] flex-col bg-[var(--bg-primary)]"
      initial={reduce_motion ? false : { opacity: 0 }}
      style={{
        paddingTop: safe_area_insets.top,
        paddingBottom: safe_area_insets.bottom,
      }}
      transition={{ duration: reduce_motion ? 0 : 0.2 }}
    >
      <AnimatePresence>
        {is_loading && (
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[var(--bg-primary)]"
            exit={reduce_motion ? undefined : { opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Spinner className="h-8 w-8 text-[#4a7aff]" size="lg" />
            <p className="text-sm text-[var(--text-secondary)]">{status}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto px-6">
        <div className="flex min-h-full flex-col justify-center py-10">
          {is_adding_account && is_authenticated ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="mb-6"
              initial={reduce_motion ? false : { opacity: 0 }}
            >
              <button
                className="flex items-center gap-1 text-sm text-[var(--text-tertiary)]"
                type="button"
                onClick={handle_cancel_add_account}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M15 19l-7-7 7-7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t("auth.back_to_inbox")}
              </button>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1 }}
              className="mb-4"
              initial={reduce_motion ? false : { opacity: 0 }}
            >
              <motion.button
                className={BACK_BUTTON_CLASS}
                style={BACK_BUTTON_STYLE}
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate("/welcome")}
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </motion.button>
            </motion.div>
          )}

          <motion.div
            animate="animate"
            initial={reduce_motion ? false : "initial"}
            variants={reduce_motion ? undefined : stagger_container}
          >
            <motion.div
              className="flex justify-center"
              variants={reduce_motion ? undefined : fade_up_item}
            >
              <img
                alt="Aster"
                className="h-10"
                decoding="async"
                src="/text_logo.png"
              />
            </motion.div>

            <motion.div variants={reduce_motion ? undefined : fade_up_item}>
              <h1 className="mt-8 text-center text-[28px] font-bold leading-tight text-[var(--text-primary)]">
                {t("auth.sign_in_to_aster")}
              </h1>
            </motion.div>

            <motion.div variants={reduce_motion ? undefined : fade_up_item}>
              <p className="mt-2 text-center text-sm leading-relaxed text-[var(--text-tertiary)]">
                {t("auth.enter_credentials")}
              </p>
            </motion.div>

            <AnimatePresence>
              {error && (
                <motion.p
                  animate={{ opacity: 1 }}
                  className="mt-4 text-center text-sm"
                  exit={{ opacity: 0 }}
                  initial={reduce_motion ? false : { opacity: 0 }}
                  style={{ color: is_dark ? "#f87171" : "#dc2626" }}
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.div
              className="mt-8"
              variants={reduce_motion ? undefined : fade_up_item}
            >
              <label className={LABEL_CLASS}>{t("auth.username")}</label>
              <div className={DEPTH_INPUT_WRAPPER_CLASS}>
                <div className={INPUT_ICON_CLASS}>
                  <UserCircleIcon />
                </div>
                <Input
                  autoComplete="username"
                  className={INNER_INPUT_WITH_ICON_CLASS}
                  disabled={is_loading}
                  maxLength={55}
                  placeholder={t("common.yourname_placeholder")}
                  status={error ? "error" : "default"}
                  type="text"
                  value={username}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const at_index = raw.indexOf("@");

                    if (at_index !== -1) {
                      const local = sanitize_username(
                        raw.substring(0, at_index),
                      );
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
                  onKeyDown={(e) =>
                    e["key"] === "Enter" && !is_loading && handle_login()
                  }
                />
              </div>
            </motion.div>

            <motion.div
              className="mt-2"
              variants={reduce_motion ? undefined : fade_up_item}
            >
              <div className="relative flex rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]">
                <div
                  className="absolute top-1 bottom-1 rounded-lg transition-all duration-200 ease-out"
                  style={{
                    width: "calc(50% - 4px)",
                    left:
                      email_domain === "astermail.org" ? "4px" : "calc(50%)",
                    backgroundColor: is_dark
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.06)",
                  }}
                />
                <button
                  className={`relative h-10 flex-1 rounded-lg text-sm font-medium transition-colors duration-150 ${email_domain === "astermail.org" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                  disabled={is_loading}
                  type="button"
                  onClick={() => set_email_domain("astermail.org")}
                >
                  @astermail.org
                </button>
                <button
                  className={`relative h-10 flex-1 rounded-lg text-sm font-medium transition-colors duration-150 ${email_domain === "aster.cx" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                  disabled={is_loading}
                  type="button"
                  onClick={() => set_email_domain("aster.cx")}
                >
                  @aster.cx
                </button>
              </div>
            </motion.div>

            <motion.div
              className="mt-4"
              variants={reduce_motion ? undefined : fade_up_item}
            >
              <label className={LABEL_CLASS}>{t("auth.password")}</label>
              <div className={DEPTH_INPUT_WRAPPER_CLASS}>
                <div className={INPUT_ICON_CLASS}>
                  <LockClosedIcon />
                </div>
                <Input
                  autoComplete="current-password"
                  className={INNER_INPUT_WITH_ICON_CLASS}
                  disabled={is_loading}
                  maxLength={128}
                  placeholder={t("auth.enter_password_placeholder")}
                  status={error ? "error" : "default"}
                  type={is_password_visible ? "text" : "password"}
                  value={password}
                  onChange={(e) => set_password(e.target.value)}
                  onKeyDown={(e) =>
                    e["key"] === "Enter" && !is_loading && handle_login()
                  }
                />
                <button
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center focus:outline-none"
                  type="button"
                  onClick={() => set_is_password_visible(!is_password_visible)}
                >
                  {is_password_visible ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
              </div>
            </motion.div>

            <motion.div
              className="mt-4"
              variants={reduce_motion ? undefined : fade_up_item}
            >
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded border transition-colors"
                    disabled={is_loading}
                    style={{
                      backgroundColor: remember_me
                        ? "#3b82f6"
                        : is_dark
                          ? "#1f1f1f"
                          : "#ffffff",
                      borderColor: remember_me
                        ? "#3b82f6"
                        : is_dark
                          ? "#404040"
                          : "#d1d5db",
                    }}
                    type="button"
                    onClick={() => set_remember_me(!remember_me)}
                  >
                    {remember_me && (
                      <svg
                        className="h-3 w-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M5 13l4 4L19 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                  <span className="text-sm text-[var(--text-secondary)]">
                    {t("auth.keep_signed_in")}
                  </span>
                </label>
                <Link
                  className="text-xs font-semibold text-[#4a7aff]"
                  to="/forgot-password"
                >
                  {t("auth.forgot_password")}
                </Link>
              </div>
            </motion.div>

            <motion.div
              className="mt-6"
              variants={reduce_motion ? undefined : fade_up_item}
            >
              <TurnstileWidget
                ref={turnstile_ref}
                class_name="flex justify-center"
                on_expire={() => set_captcha_token("")}
                on_verify={set_captcha_token}
              />
            </motion.div>

            <motion.div
              className="mt-4"
              variants={reduce_motion ? undefined : fade_up_item}
            >
              <motion.button
                className={DEPTH_CTA_CLASS}
                disabled={
                  is_loading || (!!TURNSTILE_SITE_KEY && !captcha_token)
                }
                style={DEPTH_CTA_STYLE}
                whileTap={button_tap}
                onClick={handle_login}
              >
                {t("auth.sign_in")}
              </motion.button>
            </motion.div>

            <motion.div
              className="mt-3"
              variants={reduce_motion ? undefined : fade_up_item}
            >
              <motion.button
                className={
                  DEPTH_SECONDARY_CLASS +
                  " flex items-center justify-center gap-2"
                }
                whileTap={button_tap}
                onClick={() => navigate("/register" + location.search)}
              >
                <span>
                  {t("auth.dont_have_account")} {t("auth.sign_up")}
                </span>
                <ArrowRightIcon className="h-4 w-4" />
              </motion.button>
            </motion.div>

          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
