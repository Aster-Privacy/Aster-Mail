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
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useCallback, useEffect, useRef } from "react";

import {
  SignInDomain,
  decrypt_checkout_password,
  decrypt_with_prf,
  get_safe_next_path,
  parse_prefill_identity,
} from "./sign_in_helpers";

import { use_auth } from "@/contexts/auth_context";
import { api_client } from "@/services/api/client";
import { use_i18n } from "@/lib/i18n/context";
import { useTheme } from "@/contexts/theme_context";
import {
  hash_email,
  derive_password_hash,
  decrypt_vault,
  base64_to_array,
} from "@/services/crypto/key_manager";
import { login_user, get_user_salt, get_user_info } from "@/services/api/auth";
import { resend_pending_verification } from "@/services/api/recovery_email";
import { check_and_replenish_prekeys } from "@/services/crypto/prekey_service";
import { type TurnstileWidgetRef } from "@/components/auth/turnstile_widget";
import {
  get_totp_status,
  is_totp_required_response,
  TotpVerifyResponse,
} from "@/services/api/totp";
import { is_webauthn_supported } from "@/services/api/webauthn";
import { get_session_passphrase } from "@/contexts/auth/session_passphrase";
import { emit_auth_ready } from "@/hooks/mail_events";
import {
  is_tauri,
  consume_pending_device_login,
} from "@/native/desktop_device_auth";
import { show_toast } from "@/components/toast/simple_toast";
import { hard_redirect, get_app_query_param } from "@/lib/hard_redirect";
import { ignore_error } from "@/lib/ignore_error";
import { user_facing_error } from "@/utils/user_facing_error";

export function use_sign_in_page() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const checkout_started = useRef(false);

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
    get_app_query_param("reason") === "session_expired"
      ? t("common.session_expired_sign_in")
      : "",
  );
  const [status, set_status] = useState("");
  const [is_checkout_login, set_is_checkout_login] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    return (
      params.get("checkout") === "success" &&
      !!params.get("ep") &&
      !!params.get("en") &&
      !!params.get("u") &&
      hash.includes("tk=")
    );
  });
  const [checkout_status, set_checkout_status] = useState("");
  const [device_logging_in, set_device_logging_in] = useState(false);

  useEffect(() => {
    if (!is_tauri()) return;

    type DeviceLoginDetail = {
      login_response: {
        user_id: string;
        username: string;
        email: string;
        encrypted_vault: string;
        vault_nonce: string;
      };
      passphrase: string | null;
    };

    const process_device_login = async (detail: DeviceLoginDetail) => {
      if (!detail.passphrase) {
        show_toast(t("errors.login_failed"), "error");

        return;
      }

      set_device_logging_in(true);
      try {
        const vault = await decrypt_vault(
          detail.login_response.encrypted_vault,
          detail.login_response.vault_nonce,
          detail.passphrase,
        );
        const user_info_response = await get_user_info();
        const user_data = user_info_response.data
          ? {
              id: detail.login_response.user_id,
              username: detail.login_response.username,
              email: detail.login_response.email,
              display_name: user_info_response.data.display_name || undefined,
              profile_color: user_info_response.data.profile_color || undefined,
              profile_picture:
                user_info_response.data.profile_picture || undefined,
            }
          : {
              id: detail.login_response.user_id,
              username: detail.login_response.username,
              email: detail.login_response.email,
            };

        await login(
          user_data,
          vault,
          detail.passphrase,
          detail.login_response.encrypted_vault,
          detail.login_response.vault_nonce,
        );
        setTimeout(() => emit_auth_ready(), 50);
        hard_redirect(get_safe_next_path());
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
        set_device_logging_in(false);
        show_toast(t("errors.login_failed"), "error");
      }
    };

    const pending = consume_pending_device_login();

    if (pending) {
      process_device_login(pending as DeviceLoginDetail);
    }

    const handle_login_success = () => {
      const pending = consume_pending_device_login();

      if (pending) {
        process_device_login(pending as DeviceLoginDetail);
      }
    };

    window.addEventListener(
      "astermail:device-login-success",
      handle_login_success,
    );

    return () => {
      window.removeEventListener(
        "astermail:device-login-success",
        handle_login_success,
      );
    };
  }, [login, t]);

  useEffect(() => {
    document.title = `${t("auth.sign_in")} | ${t("common.aster_mail")}`;
  }, [t]);

  useEffect(() => {
    if (!preloaded.current) {
      preloaded.current = true;
      import("@/pages/register").catch((caught) =>
        ignore_error("pages/use_sign_in_page:handle_login_success", caught),
      );
    }
  }, []);

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
    if (has_existing_session) {
      const academic = new URLSearchParams(window.location.search).get(
        "academic",
      );

      if (academic === "verified") {
        navigate("/settings/billing?academic=verified", { replace: true });
      } else {
        navigate(get_safe_next_path(), { replace: true });
      }
    }
  }, [has_existing_session, navigate]);

  useEffect(() => {
    if (auth_loading || checkout_started.current) return;

    const params = new URLSearchParams(window.location.search);

    if (params.get("checkout") !== "success") return;

    const scrub_checkout_params = () => {
      const clean_url = new URL(window.location.href);

      clean_url.searchParams.delete("checkout");
      clean_url.searchParams.delete("ep");
      clean_url.searchParams.delete("en");
      clean_url.searchParams.delete("u");
      clean_url.searchParams.delete("plan");
      clean_url.searchParams.delete("billing");
      clean_url.hash = "";
      window.history.replaceState({}, "", clean_url.toString());
    };

    const ep = params.get("ep");
    const en = params.get("en");
    const checkout_username = params.get("u") || "";
    const checkout_plan = params.get("plan") || "";
    const checkout_billing = params.get("billing") || "";
    const hash = window.location.hash;
    const tk_match = hash.match(/tk=([A-Za-z0-9_-]+)/);

    if (!ep || !en || !tk_match || !checkout_username) {
      set_is_checkout_login(false);

      return;
    }

    checkout_started.current = true;
    set_is_checkout_login(true);

    const translate = t;

    (async () => {
      try {
        set_checkout_status(translate("auth.authenticating"));

        await api_client.clear_session_cookies();

        let raw_password: string;

        try {
          raw_password = await decrypt_checkout_password(ep, en, tk_match[1]);
        } catch (decrypt_err) {
          throw new Error(
            `Decryption failed: ${decrypt_err instanceof Error ? decrypt_err.message : "unknown"}`,
          );
        }

        const email = `${checkout_username}@astermail.org`;
        const user_hash = await hash_email(email);

        set_checkout_status(translate("auth.fetching_auth_data"));
        const salt_response = await get_user_salt({ user_hash });

        if (salt_response.error || !salt_response.data) {
          throw new Error(
            salt_response.error || translate("errors.account_not_found"),
          );
        }

        const salt = base64_to_array(salt_response.data.salt);
        const { hash: password_hash } = await derive_password_hash(
          raw_password,
          salt,
        );

        set_checkout_status(translate("auth.verifying_credentials"));
        const response = await login_user({
          user_hash,
          password_hash,
          remember_me: true,
          is_adding_account,
        });

        if (response.error || !response.data) {
          throw new Error(response.error || translate("errors.login_failed"));
        }

        if (is_totp_required_response(response.data)) {
          set_is_checkout_login(false);
          set_password(raw_password);
          set_username(checkout_username);
          set_pending_login_token(response.data.pending_login_token);
          const methods = response.data.available_methods || ["totp"];

          set_available_2fa_methods(methods);
          if (methods.includes("webauthn") && is_webauthn_supported()) {
            set_active_2fa_method("webauthn");
          } else {
            set_active_2fa_method("totp");
          }
          set_totp_required(true);
          scrub_checkout_params();

          return;
        }

        set_checkout_status(translate("auth.decrypting_vault"));
        let vault;

        try {
          vault = await decrypt_vault(
            response.data.encrypted_vault,
            response.data.vault_nonce,
            raw_password,
          );
        } catch (vault_err) {
          throw new Error(
            `Vault decryption failed: ${vault_err instanceof Error ? vault_err.message : "unknown"}`,
          );
        }

        set_checkout_status(translate("auth.getting_user_info"));
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
        } catch (caught) {
          ignore_error("pages/use_sign_in_page:handle_login_success", caught);
        }

        const checkout_user_data = user_info_response?.data
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

        await login(
          checkout_user_data,
          vault,
          raw_password,
          response.data.encrypted_vault,
          response.data.vault_nonce,
        );

        if (response.data.needs_prekey_replenishment) {
          check_and_replenish_prekeys();
        }

        sessionStorage.setItem(
          "aster_checkout_success",
          JSON.stringify({ plan: checkout_plan, billing: checkout_billing }),
        );

        scrub_checkout_params();

        hard_redirect(get_safe_next_path());
      } catch (err) {
        scrub_checkout_params();
        set_is_checkout_login(false);
        set_username(checkout_username);
        if (err instanceof Error && /decrypt/i.test(err.message)) {
          set_error(translate("errors.wrong_vault_password"));
        } else {
          set_error(user_facing_error(err, translate("errors.login_failed")));
        }
      }
    })();
  }, [auth_loading, login]);

  const [captcha_token, set_captcha_token] = useState("");
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const [pending_verification_hash, set_pending_verification_hash] = useState<
    string | null
  >(null);
  const [resend_cooldown, set_resend_cooldown] = useState(0);
  const resend_cooldown_ref = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const [is_resending, set_is_resending] = useState(false);

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
          set_captcha_token("");
          set_totp_required(false);
          set_pending_login_token("");
          set_available_2fa_methods([]);
          set_active_2fa_method("totp");

          return;
        }

        let vault;

        try {
          vault = await decrypt_vault(
            totp_response.encrypted_vault,
            totp_response.vault_nonce,
            password,
          );
        } catch (vault_err) {
          if (password) {
            throw vault_err;
          }

          const stored = await get_session_passphrase(
            totp_response.user_id,
          ).catch(() => null);

          if (stored) {
            try {
              vault = await decrypt_vault(
                totp_response.encrypted_vault,
                totp_response.vault_nonce,
                stored,
              );
            } catch {
              // stored passphrase is stale - fall through to PRF
            }
          }

          if (
            !vault &&
            totp_response.prf_encrypted_passphrase &&
            totp_response.prf_nonce
          ) {
            const prf_out = (totp_response as any).prf_output as
              | ArrayBuffer
              | undefined;

            if (prf_out) {
              const prf_passphrase = await decrypt_with_prf(
                prf_out,
                totp_response.prf_encrypted_passphrase,
                totp_response.prf_nonce,
              ).catch(() => null);

              if (prf_passphrase) {
                try {
                  vault = await decrypt_vault(
                    totp_response.encrypted_vault,
                    totp_response.vault_nonce,
                    prf_passphrase,
                  );
                } catch {
                  // PRF passphrase also wrong
                }
              }
            }
          }

          if (!vault) {
            set_error(t("passkeys.vault_needs_password"));
            set_is_loading(false);
            set_captcha_token("");
            set_totp_required(false);
            set_pending_login_token("");
            set_available_2fa_methods([]);
            set_active_2fa_method("totp");

            return;
          }
        }

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
        } catch (caught) {
          ignore_error("pages/use_sign_in_page:handle_login_success", caught);
        }

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
            set_captcha_token("");
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
            .catch((caught) =>
              ignore_error("pages/use_sign_in_page:login_timeout", caught),
            );
        }

        set_is_loading(false);
        set_totp_required(false);
        set_pending_login_token("");
        set_available_2fa_methods([]);
        set_active_2fa_method("totp");

        navigate(get_safe_next_path());
        setTimeout(() => emit_auth_ready(), 50);

        return;
      } catch (err) {
        if (err instanceof Error && err.message === "login_timeout") {
          set_totp_required(false);
          set_pending_login_token("");
          set_available_2fa_methods([]);
          set_active_2fa_method("totp");
          navigate(get_safe_next_path());
          setTimeout(() => emit_auth_ready(), 50);

          return;
        }
        set_is_loading(false);
        set_captcha_token("");
        set_totp_required(false);
        set_pending_login_token("");
        set_available_2fa_methods([]);
        set_active_2fa_method("totp");
        if (err instanceof Error && /decrypt/i.test(err.message)) {
          set_error(t("errors.wrong_vault_password"));
        } else {
          set_error(user_facing_error(err, t("errors.login_failed")));
        }
      }
    },
    [
      password,
      is_adding_account,
      add_account,
      login,
      t,
      navigate,
      active_2fa_method,
    ],
  );

  const reset_resend_cooldown = useCallback(() => {
    if (resend_cooldown_ref.current) {
      clearInterval(resend_cooldown_ref.current);
      resend_cooldown_ref.current = null;
    }
    set_resend_cooldown(0);
  }, []);

  useEffect(
    () => () => {
      if (resend_cooldown_ref.current) {
        clearInterval(resend_cooldown_ref.current);
        resend_cooldown_ref.current = null;
      }
    },
    [],
  );

  const start_resend_cooldown = useCallback(() => {
    if (resend_cooldown_ref.current) {
      clearInterval(resend_cooldown_ref.current);
    }
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
  }, []);

  const handle_resend_pending = useCallback(async () => {
    if (!pending_verification_hash || resend_cooldown > 0 || is_resending)
      return;
    set_is_resending(true);
    const result = await resend_pending_verification(pending_verification_hash);

    set_is_resending(false);
    if (!result.data.success) {
      show_toast(t("common.something_went_wrong_try_again"), "error");

      return;
    }

    start_resend_cooldown();
  }, [
    pending_verification_hash,
    resend_cooldown,
    is_resending,
    start_resend_cooldown,
    t,
  ]);

  return {
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
    set_resend_cooldown,
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
  };
}
