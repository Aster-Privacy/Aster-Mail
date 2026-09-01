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
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Checkbox } from "@aster/ui";

import {
  Alert,
  get_safe_next_path,
  page_transition,
  page_variants,
} from "./sign_in_helpers";
import { use_sign_in_page } from "./use_sign_in_page";

import {
  hash_email,
  derive_password_hash,
  decrypt_vault,
  base64_to_array,
} from "@/services/crypto/key_manager";
import { login_user, get_user_salt, get_user_info } from "@/services/api/auth";
import { check_and_replenish_prekeys } from "@/services/crypto/prekey_service";
import {
  sanitize_username,
  timing_safe_delay,
  clamp_password,
} from "@/services/sanitize";
import { EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import {
  TurnstileWidget,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { is_totp_required_response } from "@/services/api/totp";
import { webauthn_flow } from "@/pages/sign_in/webauthn_flow";
import { totp_flow } from "@/pages/sign_in/totp_flow";
import { password_recovery_flow } from "@/pages/sign_in/password_recovery_flow";
import { is_webauthn_supported } from "@/services/api/webauthn";
import { emit_auth_ready } from "@/hooks/mail_events";
import { is_tauri } from "@/native/desktop_device_auth";
import { get_current_account_id } from "@/services/account_manager";
import { ignore_error } from "@/lib/ignore_error";
import { user_facing_error } from "@/utils/user_facing_error";

export default function SignInPage() {
  const {
    navigate,
    location,
    login,
    add_account,
    switch_to_account,
    is_adding_account,
    set_is_adding_account,
    is_authenticated,
    is_loading,
    auth_loading,
    accounts,
    t,
    is_dark,
    reauth_account_id,
    previous_account_id,
    has_existing_session,
    is_password_visible,
    set_is_password_visible,
    username,
    set_username,
    password,
    set_password,
    email_domain,
    set_email_domain,
    remember_me,
    set_remember_me,
    set_is_loading,
    error,
    set_error,
    status,
    set_status,
    is_checkout_login,
    checkout_status,
    device_logging_in,
    captcha_token,
    set_captcha_token,
    turnstile_ref,
    pending_verification_hash,
    set_pending_verification_hash,
    resend_cooldown,
    reset_resend_cooldown,
    is_resending,
    totp_required,
    set_totp_required,
    pending_login_token,
    set_pending_login_token,
    available_2fa_methods,
    set_available_2fa_methods,
    active_2fa_method,
    set_active_2fa_method,
    handle_totp_success,
    handle_resend_pending,
  } = use_sign_in_page();

  if (auth_loading || has_existing_session) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-surf-primary">
        <Spinner size="lg" />
      </div>
    );
  }

  if (is_checkout_login) {
    return (
      <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
        <div className="min-h-full flex items-center justify-center px-4">
          <div className="flex flex-col items-center">
            <img
              alt="Aster"
              className="h-10 mb-8"
              decoding="async"
              draggable={false}
              src="/text_logo.png"
            />
            <div
              className="h-8 w-8 mx-auto animate-spin rounded-full border-2 mb-4"
              style={{
                borderColor: is_dark ? "#374151" : "#bfdbfe",
                borderTopColor: is_dark
                  ? "var(--accent-color-hover)"
                  : "var(--accent-color)",
              }}
            />
            <p className="text-sm text-txt-secondary">
              {checkout_status || t("auth.signing_in")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handle_cancel_add_account = async () => {
    set_is_adding_account(false);

    if (!is_authenticated && previous_account_id) {
      try {
        await switch_to_account(previous_account_id);

        return;
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
      }
    }

    navigate("/");
  };

  const handle_totp_cancel = () => {
    set_totp_required(false);
    set_pending_login_token("");
    set_available_2fa_methods([]);
    set_active_2fa_method("totp");
    set_password("");
    set_captcha_token("");
  };

  const handle_login = async () => {
    set_error("");
    set_pending_verification_hash(null);

    const raw_local = username.includes("@")
      ? username.substring(0, username.indexOf("@"))
      : username;
    const typed_domain = username.includes("@")
      ? username
          .substring(username.indexOf("@") + 1)
          .toLowerCase()
          .trim()
      : "";
    const clean_username = sanitize_username(raw_local);
    const final_domain =
      typed_domain === "astermail.org" || typed_domain === "aster.cx"
        ? typed_domain
        : email_domain;

    if (typed_domain && final_domain !== typed_domain) {
      await timing_safe_delay();
      set_error(t("errors.sign_in_domain_unsupported"));

      return;
    }

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

    const email = `${clean_username}@${final_domain}`;

    if (is_adding_account) {
      const normalized = email.toLowerCase();
      const existing = accounts.find(
        (a) => a.user.email.toLowerCase() === normalized,
      );

      if (
        existing &&
        existing.id !== reauth_account_id &&
        existing.id !== (await get_current_account_id())
      ) {
        await timing_safe_delay();
        set_error(t("errors.account_already_added"));

        return;
      }
    }

    set_is_loading(true);
    set_status(t("auth.authenticating"));

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
        client_platform: import.meta.env.DEV ? "desktop" : undefined,
        is_adding_account,
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
        } else if (response.server_code === "PENDING_EMAIL_VERIFICATION") {
          set_error(t("errors.pending_email_verification"));
          set_pending_verification_hash(user_hash);
          reset_resend_cooldown();
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

      if (response.data.is_suspended) {
        sessionStorage.setItem("aster_suspended", "true");
        await timing_safe_delay();
        set_error(t("common.account_suspended"));
        set_is_loading(false);
        set_captcha_token("");
        turnstile_ref.current?.reset();

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
      } catch (caught) {
        ignore_error("pages/sign_in:handle_login", caught);
      }

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
        const add_result = await login_timeout(
          add_account(
            login_user_data,
            vault,
            password,
            response.data.encrypted_vault,
            response.data.vault_nonce,
          ),
        );

        if (!add_result.success) {
          set_error(add_result.error || t("errors.login_failed"));
          set_is_loading(false);
          set_captcha_token("");
          turnstile_ref.current?.reset();

          return;
        }
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

      navigate(get_safe_next_path());
      setTimeout(() => emit_auth_ready(), 50);
    } catch (err) {
      if (err instanceof Error && err.message === "login_timeout") {
        navigate(get_safe_next_path());
        setTimeout(() => emit_auth_ready(), 50);

        return;
      }
      const elapsed = Date.now() - start_time;
      const min_time = 1000;

      if (elapsed < min_time) {
        await new Promise((resolve) => setTimeout(resolve, min_time - elapsed));
      }
      if (err instanceof Error && err.message.includes("decrypt")) {
        set_error(t("errors.wrong_vault_password"));
      } else {
        set_error(user_facing_error(err, t("errors.login_failed")));
      }
      set_is_loading(false);
      set_captcha_token("");
      turnstile_ref.current?.reset();
    }
  };

  if (is_tauri() && device_logging_in) {
    return (
      <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
        <div className="min-h-full flex items-center justify-center px-4">
          <div className="flex flex-col items-center w-full max-w-sm">
            <img
              alt="Aster"
              className="h-10 mb-8"
              decoding="async"
              draggable={false}
              src="/text_logo.png"
            />
            <div
              className="h-8 w-8 mx-auto animate-spin rounded-full border-2 mb-4"
              style={{
                borderColor: is_dark ? "#374151" : "#bfdbfe",
                borderTopColor: is_dark
                  ? "var(--accent-color-hover)"
                  : "var(--accent-color)",
              }}
            />
            <p className="text-sm text-txt-secondary">{t("auth.signing_in")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (totp_required) {
    return (
      <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
        <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={active_2fa_method}
              animate="animate"
              className="flex flex-col items-center w-full max-w-sm"
              exit="exit"
              initial="initial"
              transition={page_transition}
              variants={page_variants}
            >
              {is_loading ? (
                <div className="text-center">
                  <div
                    className="h-8 w-8 mx-auto animate-spin rounded-full border-2 mb-4"
                    style={{
                      borderColor: is_dark ? "#374151" : "#bfdbfe",
                      borderTopColor: is_dark
                        ? "var(--accent-color-hover)"
                        : "var(--accent-color)",
                    }}
                  />
                  <p className="text-sm text-txt-secondary">{status}</p>
                </div>
              ) : active_2fa_method === "backup" ? (
                password_recovery_flow({
                  pending_login_token,
                  available_2fa_methods,
                  on_success: handle_totp_success,
                  on_cancel: handle_totp_cancel,
                  set_active_2fa_method,
                  remember_me,
                })
              ) : active_2fa_method === "webauthn" ? (
                webauthn_flow({
                  pending_login_token,
                  available_2fa_methods,
                  on_success: handle_totp_success,
                  on_cancel: handle_totp_cancel,
                  set_active_2fa_method,
                  remember_me,
                })
              ) : (
                totp_flow({
                  pending_login_token,
                  on_success: handle_totp_success,
                  on_cancel: handle_totp_cancel,
                  set_active_2fa_method,
                  available_2fa_methods,
                  remember_me,
                })
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key="signin"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4"
            exit="exit"
            initial="initial"
            transition={page_transition}
            variants={page_variants}
          >
            {is_adding_account &&
              (is_authenticated || !!previous_account_id) && (
                <button
                  className="flex items-center gap-1 text-sm mb-6 transition-colors hover:opacity-80 text-txt-tertiary"
                  onClick={handle_cancel_add_account}
                >
                  <svg
                    className="w-4 h-4"
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
              )}

            <img
              alt="Aster"
              className="h-10"
              decoding="async"
              draggable={false}
              src="/text_logo.png"
            />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.sign_in_to_aster")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.enter_credentials")}
            </p>

            {(() => {
              const academic = new URLSearchParams(window.location.search).get(
                "academic",
              );

              if (academic !== "verified" && academic !== "failed") return null;
              const is_ok = academic === "verified";

              return (
                <div
                  className="w-full mt-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2.5"
                  style={{
                    backgroundColor: is_ok
                      ? "rgba(34,197,94,0.12)"
                      : "rgba(245,158,11,0.12)",
                    color: is_ok ? "#16a34a" : "#b45309",
                  }}
                >
                  <svg
                    className="w-5 h-5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d={
                        is_ok
                          ? "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                          : "M12 9v3.75m0 3.75h.008M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      }
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-start leading-snug">
                    {t(
                      is_ok
                        ? "auth.academic_verified_signin_note"
                        : "auth.academic_failed_signin_note",
                    )}
                  </span>
                </div>
              );
            })()}

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <AnimatePresence>
              {pending_verification_hash && (
                <motion.div
                  animate={{ opacity: 1 }}
                  className="w-full mt-3"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    className="w-full text-sm py-2 px-4 rounded-lg border transition-colors disabled:opacity-50 text-txt-secondary border-border-primary hover:bg-surf-secondary"
                    disabled={resend_cooldown > 0 || is_resending}
                    type="button"
                    onClick={handle_resend_pending}
                  >
                    {resend_cooldown > 0
                      ? t("auth.resend_in_seconds", {
                          seconds: resend_cooldown,
                        })
                      : is_resending
                        ? t("common.loading")
                        : t("auth.resend_verification_email")}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                if (is_loading || (!!TURNSTILE_SITE_KEY && !captcha_token)) {
                  return;
                }
                handle_login();
              }}
            >
              <div className={`w-full ${error ? "mt-4" : "mt-6"} space-y-4`}>
                <div>
                  <label className="block text-sm font-medium mb-2 text-txt-primary">
                    {t("auth.username")}
                  </label>
                  <Input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    autoCapitalize="none"
                    autoComplete="username"
                    autoCorrect="off"
                    disabled={is_loading}
                    maxLength={55}
                    placeholder={t("common.yourname_placeholder")}
                    spellCheck={false}
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
                        const matched =
                          domain_part === "astermail.org" ||
                          domain_part.endsWith(".astermail.org")
                            ? "astermail.org"
                            : domain_part === "aster.cx" ||
                                domain_part.endsWith(".aster.cx")
                              ? "aster.cx"
                              : null;

                        if (matched) {
                          set_email_domain(matched);
                          set_username(local);
                        } else {
                          set_username(
                            `${local}@${domain_part.replace(/[^a-z0-9.-]/g, "")}`,
                          );
                        }
                      } else {
                        set_username(sanitize_username(raw));
                      }
                    }}
                  />
                  <div className="relative flex mt-2 aster_input !p-1 !h-auto">
                    <div
                      className="absolute top-1 bottom-1 rounded-[8px] transition-all duration-200 ease-out bg-surf-tertiary"
                      style={{
                        width: "calc(50% - 4px)",
                        left:
                          email_domain === "astermail.org"
                            ? "4px"
                            : "calc(50%)",
                      }}
                    />
                    <button
                      className={`relative flex-1 h-8 rounded-[8px] text-sm font-medium transition-colors duration-150 ${email_domain === "astermail.org" ? "text-txt-primary" : "text-txt-muted"}`}
                      disabled={is_loading}
                      type="button"
                      onClick={() => set_email_domain("astermail.org")}
                    >
                      @astermail.org
                    </button>
                    <button
                      className={`relative flex-1 h-8 rounded-[8px] text-sm font-medium transition-colors duration-150 ${email_domain === "aster.cx" ? "text-txt-primary" : "text-txt-muted"}`}
                      disabled={is_loading}
                      type="button"
                      onClick={() => set_email_domain("aster.cx")}
                    >
                      @aster.cx
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-txt-primary">
                      {t("auth.password")}
                    </label>
                    <Link
                      className="text-xs transition-colors hover:opacity-80 text-txt-tertiary"
                      to="/forgot-password"
                    >
                      {t("auth.forgot_password")}
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      autoComplete="current-password"
                      className="pe-11"
                      disabled={is_loading}
                      maxLength={128}
                      placeholder={t("auth.enter_password_placeholder")}
                      status={error ? "error" : "default"}
                      type={is_password_visible ? "text" : "password"}
                      value={password}
                      onChange={(e) =>
                        set_password(clamp_password(e.target.value))
                      }
                    />
                    <button
                      aria-label={
                        is_password_visible
                          ? t("settings.hide_password_toggle")
                          : t("settings.show_password_toggle")
                      }
                      className="absolute end-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded"
                      type="button"
                      onClick={() =>
                        set_is_password_visible(!is_password_visible)
                      }
                    >
                      {is_password_visible ? <EyeSlashIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                <Checkbox
                  checked={remember_me}
                  disabled={is_loading}
                  label={`${t("auth.keep_signed_in")} - ${t("auth.secure_devices_only")}`}
                  onChange={() => set_remember_me(!remember_me)}
                />
              </div>

              <TurnstileWidget
                ref={turnstile_ref}
                on_expire={() => set_captcha_token("")}
                on_verify={set_captcha_token}
              />

              <Button
                className="w-full mt-6"
                disabled={
                  is_loading || (!!TURNSTILE_SITE_KEY && !captcha_token)
                }
                size="xl"
                type="submit"
                variant="depth"
              >
                {is_loading ? <Spinner size="md" /> : t("auth.sign_in")}
              </Button>
            </form>

            <Button
              className="w-full mt-3"
              size="xl"
              variant="secondary"
              onClick={() => navigate("/register" + location.search)}
            >
              {t("auth.create_account")}
            </Button>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
