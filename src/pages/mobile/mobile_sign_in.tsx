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
import { ArrowRightIcon, ChevronLeftIcon } from "@heroicons/react/20/solid";

import { build_mobile_sign_in_handlers } from "./mobile_sign_in_handlers";
import { use_mobile_sign_in } from "./use_mobile_sign_in";

import { sanitize_username, clamp_password } from "@/services/sanitize";
import {
  EyeIcon,
  EyeSlashIcon,
  UserCircleIcon,
  LockClosedIcon,
} from "@/components/auth/auth_styles";
import {
  TurnstileWidget,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { TotpVerification } from "@/components/auth/totp_verification";
import { BackupCodeInput } from "@/components/auth/backup_code_input";
import { WebauthnVerification } from "@/components/auth/webauthn_verification";
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
  const {
    navigate,
    location,
    safe_area_insets,
    login,
    add_account,
    switch_to_account,
    is_adding_account,
    set_is_adding_account,
    is_authenticated,
    auth_loading,
    accounts,
    t,
    reduce_motion,
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
    is_loading,
    set_is_loading,
    error,
    set_error,
    status,
    set_status,
    captcha_token,
    set_captcha_token,
    turnstile_ref,
    totp_required,
    set_totp_required,
    pending_login_token,
    set_pending_login_token,
    available_2fa_methods,
    set_available_2fa_methods,
    active_2fa_method,
    set_active_2fa_method,
    handle_totp_success,
  } = use_mobile_sign_in();

  if (auth_loading || has_existing_session) {
    return null;
  }

  const { handle_cancel_add_account, handle_totp_cancel, handle_login } =
    build_mobile_sign_in_handlers({
      navigate,
      login,
      add_account,
      switch_to_account,
      is_adding_account,
      set_is_adding_account,
      is_authenticated,
      accounts,
      t,
      reauth_account_id,
      previous_account_id,
      username,
      password,
      set_password,
      email_domain,
      remember_me,
      set_is_loading,
      error,
      set_error,
      set_status,
      captcha_token,
      set_captcha_token,
      turnstile_ref,
      set_totp_required,
      pending_login_token,
      set_pending_login_token,
      set_available_2fa_methods,
      set_active_2fa_method,
    });

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
                <Spinner
                  className="h-8 w-8 text-[var(--mobile-accent)]"
                  size="lg"
                />
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
                remember_me={remember_me}
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
                remember_me={remember_me}
              />
            ) : (
              <TotpVerification
                on_cancel={handle_totp_cancel}
                on_success={handle_totp_success}
                on_use_backup_code={() => set_active_2fa_method("backup")}
                on_use_passkey={
                  available_2fa_methods.includes("webauthn")
                    ? () => set_active_2fa_method("webauthn")
                    : undefined
                }
                pending_login_token={pending_login_token}
                remember_me={remember_me}
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
            <Spinner
              className="h-8 w-8 text-[var(--mobile-accent)]"
              size="lg"
            />
            <p className="text-sm text-[var(--text-secondary)]">{status}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto px-6">
        <div className="flex min-h-full flex-col justify-center py-10">
          {is_adding_account && (is_authenticated || !!previous_account_id) ? (
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
                <ChevronLeftIcon className="h-5 w-5 rtl:-scale-x-100" />
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
                draggable={false}
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
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect="off"
                  spellCheck={false}
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
                  className={`relative h-10 flex-1 rounded-[14px] text-sm font-medium transition-colors duration-150 ${email_domain === "astermail.org" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                  disabled={is_loading}
                  type="button"
                  onClick={() => set_email_domain("astermail.org")}
                >
                  @astermail.org
                </button>
                <button
                  className={`relative h-10 flex-1 rounded-[14px] text-sm font-medium transition-colors duration-150 ${email_domain === "aster.cx" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
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
                  onChange={(e) => set_password(clamp_password(e.target.value))}
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
                        ? "var(--mobile-accent)"
                        : is_dark
                          ? "#1f1f1f"
                          : "#ffffff",
                      borderColor: remember_me
                        ? "var(--mobile-accent)"
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
                  className="text-xs font-semibold text-[var(--mobile-accent)]"
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
                <ArrowRightIcon className="h-4 w-4 rtl:-scale-x-100" />
              </motion.button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
