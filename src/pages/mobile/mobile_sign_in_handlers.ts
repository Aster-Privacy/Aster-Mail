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

import type { use_mobile_sign_in } from "./use_mobile_sign_in";

import {
  hash_email,
  derive_password_hash,
  decrypt_vault,
  base64_to_array,
} from "@/services/crypto/key_manager";
import { login_user, get_user_salt, get_user_info } from "@/services/api/auth";
import { check_and_replenish_prekeys } from "@/services/crypto/prekey_service";
import { sanitize_username, timing_safe_delay } from "@/services/sanitize";
import { is_totp_required_response } from "@/services/api/totp";
import { is_webauthn_supported } from "@/services/api/webauthn";
import { emit_auth_ready } from "@/hooks/mail_events";
import { get_current_account_id } from "@/services/account_manager";
import { ignore_error } from "@/lib/ignore_error";
import { user_facing_error } from "@/utils/user_facing_error";

type MobileSignInHandlerParams = Pick<
  ReturnType<typeof use_mobile_sign_in>,
  | "navigate"
  | "login"
  | "add_account"
  | "switch_to_account"
  | "is_adding_account"
  | "set_is_adding_account"
  | "is_authenticated"
  | "accounts"
  | "t"
  | "reauth_account_id"
  | "previous_account_id"
  | "username"
  | "password"
  | "set_password"
  | "email_domain"
  | "remember_me"
  | "set_is_loading"
  | "error"
  | "set_error"
  | "set_status"
  | "captcha_token"
  | "set_captcha_token"
  | "turnstile_ref"
  | "set_totp_required"
  | "pending_login_token"
  | "set_pending_login_token"
  | "set_available_2fa_methods"
  | "set_active_2fa_method"
>;

export function build_mobile_sign_in_handlers(
  params: MobileSignInHandlerParams,
) {
  const {
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
    set_error,
    set_status,
    captcha_token,
    set_captcha_token,
    turnstile_ref,
    set_totp_required,
    set_pending_login_token,
    set_available_2fa_methods,
    set_active_2fa_method,
  } = params;

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
  };

  const handle_login = async () => {
    set_error("");

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
        ignore_error(
          "pages/mobile/mobile_sign_in_handlers:handle_login",
          caught,
        );
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
        set_error(t("errors.wrong_vault_password"));
      } else {
        set_error(user_facing_error(err, t("errors.login_failed")));
      }
      set_is_loading(false);
      set_captcha_token("");
      turnstile_ref.current?.reset();
    }
  };

  return {
    handle_cancel_add_account,
    handle_totp_cancel,
    handle_login,
  };
}
