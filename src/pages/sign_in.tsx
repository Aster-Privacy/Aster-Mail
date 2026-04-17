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
import { Button, Checkbox } from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";
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
import { check_and_replenish_prekeys } from "@/services/crypto/prekey_service";
import { store_switch_token } from "@/services/account_manager";
import { sanitize_username, timing_safe_delay } from "@/services/sanitize";
import { EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import {
  TurnstileWidget,
  type TurnstileWidgetRef,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  is_totp_required_response,
  TotpVerifyResponse,
} from "@/services/api/totp";
import { webauthn_flow } from "@/pages/sign_in/webauthn_flow";
import { totp_flow } from "@/pages/sign_in/totp_flow";
import { password_recovery_flow } from "@/pages/sign_in/password_recovery_flow";
import { is_webauthn_supported } from "@/services/api/webauthn";
import { emit_auth_ready } from "@/hooks/mail_events";
import {
  is_tauri,
  consume_pending_device_login,
} from "@/native/desktop_device_auth";
import { show_toast } from "@/components/toast/simple_toast";

const page_variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
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

function from_base64url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(pad);

  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function decrypt_checkout_password(
  ep: string,
  en: string,
  tk: string,
): Promise<string> {
  const transfer_key = from_base64url(tk);
  const nonce = from_base64url(en);
  const encrypted = from_base64url(ep);

  const key = await crypto.subtle.importKey(
    "raw",
    transfer_key,
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    encrypted,
  );

  return new TextDecoder().decode(decrypted);
}

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const is_dark = theme === "dark";

  const has_existing_session =
    !auth_loading &&
    is_authenticated &&
    !!current_account_id &&
    !is_adding_account &&
    !location.state?.from;

  const preloaded = useRef(false);
  const checkout_started = useRef(false);

  const [is_password_visible, set_is_password_visible] = useState(false);
  const [username, set_username] = useState(() => {
    const params = new URLSearchParams(window.location.search);

    return params.get("u") || "";
  });
  const [password, set_password] = useState("");
  const [email_domain, set_email_domain] = useState<
    "astermail.org" | "aster.cx"
  >("astermail.org");
  const [remember_me, set_remember_me] = useState(true);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
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
        window.location.replace("/");
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

    const handle_login_success = (event: Event) => {
      const detail = (event as CustomEvent).detail as DeviceLoginDetail;

      process_device_login(detail);
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
    if (!preloaded.current) {
      preloaded.current = true;
      import("@/pages/register").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (has_existing_session) {
      navigate("/", { replace: true });
    } else if (
      !auth_loading &&
      !current_account_id &&
      !is_adding_account &&
      !is_checkout_login
    ) {
      api_client.clear_session_cookies();
    }
  }, [
    has_existing_session,
    auth_loading,
    current_account_id,
    is_adding_account,
    is_checkout_login,
    navigate,
  ]);

  useEffect(() => {
    if (auth_loading || checkout_started.current) return;

    const params = new URLSearchParams(window.location.search);

    if (params.get("checkout") !== "success") return;

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
        } catch {}

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

        if (
          response.data.switch_token &&
          response.data.switch_token_expires_at
        ) {
          await store_switch_token(
            response.data.user_id,
            response.data.switch_token,
            response.data.switch_token_expires_at,
          );
        }

        if (response.data.needs_prekey_replenishment) {
          check_and_replenish_prekeys();
        }

        sessionStorage.setItem(
          "aster_checkout_success",
          JSON.stringify({ plan: checkout_plan, billing: checkout_billing }),
        );

        const clean_url = new URL(window.location.href);

        clean_url.searchParams.delete("checkout");
        clean_url.searchParams.delete("ep");
        clean_url.searchParams.delete("en");
        clean_url.searchParams.delete("u");
        clean_url.searchParams.delete("plan");
        clean_url.searchParams.delete("billing");
        clean_url.hash = "";
        window.history.replaceState({}, "", clean_url.toString());

        window.location.replace("/");
      } catch (err) {
        set_is_checkout_login(false);
        set_username(checkout_username);
        if (err instanceof Error && err.message.includes("decrypt")) {
          set_error(translate("errors.decrypt_failed"));
        } else {
          set_error(
            err instanceof Error
              ? err.message
              : translate("errors.login_failed"),
          );
        }
      }
    })();
  }, [auth_loading, login]);

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

          if (
            totp_response.switch_token &&
            totp_response.switch_token_expires_at
          ) {
            await store_switch_token(
              totp_response.user_id,
              totp_response.switch_token,
              totp_response.switch_token_expires_at,
            );
          }
        }

        if (totp_response.needs_prekey_replenishment) {
          check_and_replenish_prekeys();
        }

        if (totp_response.is_suspended) {
          sessionStorage.setItem("aster_suspended", "true");
        }

        set_is_loading(false);

        window.location.replace("/");

        return;
      } catch (err) {
        if (err instanceof Error && err.message === "login_timeout") {
          window.location.replace("/");

          return;
        }
        set_is_loading(false);
        set_totp_required(false);
        set_pending_login_token("");
        set_available_2fa_methods([]);
        set_active_2fa_method("totp");
        if (err instanceof Error && err.message.includes("decrypt")) {
          set_error(t("errors.decrypt_failed"));
        } else {
          set_error(
            err instanceof Error ? err.message : t("errors.login_failed"),
          );
        }
      }
    },
    [password, is_adding_account, add_account, login, t, navigate],
  );

  if (auth_loading || has_existing_session) {
    return null;
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
              src="/text_logo.png"
            />
            <div
              className="h-8 w-8 mx-auto animate-spin rounded-full border-2 mb-4"
              style={{
                borderColor: is_dark ? "#374151" : "#bfdbfe",
                borderTopColor: is_dark ? "#60a5fa" : "#2563eb",
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

      if (
        !is_adding_account &&
        response.data.switch_token &&
        response.data.switch_token_expires_at
      ) {
        await store_switch_token(
          response.data.user_id,
          response.data.switch_token,
          response.data.switch_token_expires_at,
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

  if (is_tauri() && device_logging_in) {
    return (
      <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
        <div className="min-h-full flex items-center justify-center px-4">
          <div className="flex flex-col items-center w-full max-w-sm">
            <img
              alt="Aster"
              className="h-10 mb-8"
              decoding="async"
              src="/text_logo.png"
            />
            <div
              className="h-8 w-8 mx-auto animate-spin rounded-full border-2 mb-4"
              style={{
                borderColor: is_dark ? "#374151" : "#bfdbfe",
                borderTopColor: is_dark ? "#60a5fa" : "#2563eb",
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
                      borderTopColor: is_dark ? "#60a5fa" : "#2563eb",
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
                })
              ) : active_2fa_method === "webauthn" ? (
                webauthn_flow({
                  pending_login_token,
                  available_2fa_methods,
                  on_success: handle_totp_success,
                  on_cancel: handle_totp_cancel,
                  set_active_2fa_method,
                })
              ) : (
                totp_flow({
                  pending_login_token,
                  on_success: handle_totp_success,
                  on_cancel: handle_totp_cancel,
                  set_active_2fa_method,
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
            {is_adding_account && is_authenticated && (
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
              src="/text_logo.png"
            />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.sign_in_to_aster")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.enter_credentials")}
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div className={`w-full ${error ? "mt-4" : "mt-6"} space-y-4`}>
              <div>
                <label className="block text-sm font-medium mb-2 text-txt-primary">
                  {t("auth.username")}
                </label>
                <Input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  autoComplete="username"
                  disabled={is_loading}
                  maxLength={55}
                  placeholder="yourname"
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
                    className="pr-11"
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center focus:outline-none"
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
              disabled={is_loading || (!!TURNSTILE_SITE_KEY && !captcha_token)}
              size="xl"
              variant="depth"
              onClick={handle_login}
            >
              {is_loading ? (
                <>
                  <Spinner className="mr-2" size="md" />
                  {t("auth.signing_in")}
                </>
              ) : (
                t("auth.sign_in")
              )}
            </Button>

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
