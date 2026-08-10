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
import type { SignInDomain } from "./mobile_sign_in_helpers";

import { useNavigate, useLocation } from "react-router-dom";
import { useState, useCallback, useEffect, useRef } from "react";

import { parse_prefill_identity } from "./mobile_sign_in_helpers";

import { use_auth } from "@/contexts/auth_context";
import { api_client } from "@/services/api/client";
import { use_i18n } from "@/lib/i18n/context";
import { useTheme } from "@/contexts/theme_context";
import { use_platform } from "@/hooks/use_platform";
import { decrypt_vault } from "@/services/crypto/key_manager";
import { get_user_info } from "@/services/api/auth";
import { check_and_replenish_prekeys } from "@/services/crypto/prekey_service";
import { type TurnstileWidgetRef } from "@/components/auth/turnstile_widget";
import { use_should_reduce_motion } from "@/provider";
import { get_totp_status, TotpVerifyResponse } from "@/services/api/totp";
import { show_toast } from "@/components/toast/simple_toast";
import { emit_auth_ready } from "@/hooks/mail_events";
import { get_app_query_param } from "@/lib/hard_redirect";

export function use_mobile_sign_in() {
  const navigate = useNavigate();
  const location = useLocation();
  const { safe_area_insets } = use_platform();
  const {
    login,
    add_account,
    switch_to_account,
    is_adding_account,
    set_is_adding_account,
    is_authenticated,
    is_loading: auth_loading,
    current_account_id,
    accounts,
  } = use_auth();
  const { theme } = useTheme();
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const is_dark = theme === "dark";

  const [reauth_account_id] = useState(() => get_app_query_param("reauth"));
  const [previous_account_id] = useState(() => get_app_query_param("from"));

  const has_existing_session =
    !auth_loading &&
    is_authenticated &&
    !!current_account_id &&
    !is_adding_account &&
    !reauth_account_id &&
    !location.state?.from;

  const preloaded = useRef(false);

  useEffect(() => {
    if (!reauth_account_id || auth_loading || is_adding_account) return;
    set_is_adding_account(true);
  }, [
    reauth_account_id,
    auth_loading,
    is_adding_account,
    set_is_adding_account,
  ]);

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
  const [username, set_username] = useState(
    () => parse_prefill_identity().local,
  );
  const [password, set_password] = useState("");
  const [email_domain, set_email_domain] = useState<SignInDomain>(
    () => parse_prefill_identity().domain ?? "astermail.org",
  );
  const [remember_me, set_remember_me] = useState(true);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState(() =>
    new URLSearchParams(window.location.search).get("reason") ===
    "session_expired"
      ? t("common.session_expired_sign_in")
      : "",
  );
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
        if (totp_response.is_suspended) {
          sessionStorage.setItem("aster_suspended", "true");
          set_error(t("common.account_suspended"));
          set_is_loading(false);
          set_totp_required(false);
          set_pending_login_token("");
          set_available_2fa_methods([]);
          set_active_2fa_method("totp");

          return;
        }

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

        const login_timeout = <T>(promise: Promise<T>): Promise<T> =>
          Promise.race([
            promise,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("login_timeout")), 15_000),
            ),
          ]);

        if (is_adding_account) {
          const add_result = await login_timeout(
            add_account(
              user_data,
              vault,
              password,
              totp_response.encrypted_vault,
              totp_response.vault_nonce,
            ),
          );

          if (!add_result.success) {
            set_error(add_result.error || t("errors.login_failed"));
            set_is_loading(false);
            set_totp_required(false);
            set_pending_login_token("");
            set_available_2fa_methods([]);
            set_active_2fa_method("totp");

            return;
          }
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

        if (active_2fa_method === "backup") {
          get_totp_status()
            .then((status_response) => {
              if (status_response.data) {
                show_toast(
                  t("auth.backup_codes_remaining_after_login", {
                    count: status_response.data.backup_codes_remaining,
                  }),
                  status_response.data.backup_codes_remaining <= 3
                    ? "error"
                    : "success",
                  5000,
                );
              }
            })
            .catch(() => {});
        }

        set_totp_required(false);
        set_pending_login_token("");
        set_available_2fa_methods([]);
        set_active_2fa_method("totp");
        navigate("/");
        setTimeout(() => emit_auth_ready(), 50);
      } catch (err) {
        if (err instanceof Error && err.message === "login_timeout") {
          set_totp_required(false);
          set_pending_login_token("");
          set_available_2fa_methods([]);
          set_active_2fa_method("totp");
          navigate("/");
          setTimeout(() => emit_auth_ready(), 50);

          return;
        }
        if (err instanceof Error && err.message.includes("decrypt")) {
          set_error(t("errors.wrong_vault_password"));
        } else {
          set_error(
            err instanceof Error ? err.message : t("errors.login_failed"),
          );
        }
        set_is_loading(false);
        set_totp_required(false);
        set_pending_login_token("");
        set_available_2fa_methods([]);
        set_active_2fa_method("totp");
      }
    },
    [
      password,
      is_adding_account,
      add_account,
      login,
      navigate,
      t,
      active_2fa_method,
    ],
  );

  return {
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
  };
}
