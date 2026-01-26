import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { useTheme } from "@/contexts/theme_context";
import {
  hash_email,
  derive_password_hash,
  decrypt_vault,
  base64_to_array,
} from "@/services/crypto/key_manager";
import { login_user, get_user_salt, get_user_info } from "@/services/api/auth";
import { sanitize_username, timing_safe_delay } from "@/services/sanitize";
import { EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import { Spinner } from "@/components/ui/spinner";
import { TotpVerification } from "@/components/auth/totp_verification";
import { BackupCodeInput } from "@/components/auth/backup_code_input";
import {
  is_totp_required_response,
  TotpVerifyResponse,
} from "@/services/api/totp";

const TRUSTED_REDIRECT_ORIGINS = [
  "http://localhost:5174",
  "http://localhost:5173",
  "https://portal.astermail.org",
  "https://mail.astermail.org",
];

function is_safe_redirect_url(url: string, current_origin: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin === current_origin) return true;
    return TRUSTED_REDIRECT_ORIGINS.includes(parsed.origin);
  } catch {
    return false;
  }
}

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

const Alert = ({ message, is_dark }: AlertProps) => (
  <motion.div
    animate={{ opacity: 1 }}
    className="w-full mt-6"
    exit={{ opacity: 0 }}
    initial={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
  >
    <p
      className="text-sm text-center"
      style={{ color: is_dark ? "#f87171" : "#dc2626" }}
    >
      {message}
    </p>
  </motion.div>
);

export default function SignInPage() {
  const navigate = useNavigate();
  const [search_params] = useSearchParams();
  const {
    login,
    add_account,
    is_adding_account,
    set_is_adding_account,
    is_authenticated,
  } = use_auth();
  const { theme } = useTheme();
  const { t } = use_i18n();
  const is_dark = theme === "dark";

  const get_redirect_url = useCallback((): string | null => {
    const redirect = search_params.get("redirect");
    if (redirect && is_safe_redirect_url(redirect, window.location.origin)) {
      return redirect;
    }
    return null;
  }, [search_params]);

  const handle_navigation_after_login = useCallback(() => {
    const redirect_url = get_redirect_url();
    if (redirect_url) {
      window.location.href = redirect_url;
    } else {
      navigate("/");
    }
  }, [get_redirect_url, navigate]);

  useEffect(() => {
    document.title = "Sign In | Aster Mail";
  }, []);

  const handle_cancel_add_account = () => {
    set_is_adding_account(false);
    navigate("/");
  };

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

  const [totp_required, set_totp_required] = useState(false);
  const [pending_login_token, set_pending_login_token] = useState("");
  const [use_backup_code, set_use_backup_code] = useState(false);

  const handle_totp_cancel = () => {
    set_totp_required(false);
    set_pending_login_token("");
    set_use_backup_code(false);
    set_password("");
  };

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
        const user_info_response = await get_user_info();

        const user_data = user_info_response.data
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

        if (is_adding_account) {
          await add_account(
            user_data,
            vault,
            password,
            totp_response.encrypted_vault,
            totp_response.vault_nonce,
          );
          navigate("/");
        } else {
          await login(
            user_data,
            vault,
            password,
            totp_response.encrypted_vault,
            totp_response.vault_nonce,
          );
          handle_navigation_after_login();
        }
      } catch (err) {
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
    [password, is_adding_account, add_account, login, navigate, t, handle_navigation_after_login],
  );

  const handle_login = async () => {
    set_error("");

    const clean_username = sanitize_username(username);

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

    const email = `${clean_username}@${email_domain}`;
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
      });

      if (response.error) {
        const elapsed = Date.now() - start_time;
        const min_time = 1000;

        if (elapsed < min_time) {
          await new Promise((resolve) =>
            setTimeout(resolve, min_time - elapsed),
          );
        }
        set_error(response.error);
        set_is_loading(false);

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
      const user_info_response = await get_user_info();

      if (user_info_response.data) {
        const updated_user = {
          id: response.data.user_id,
          username: response.data.username,
          email: response.data.email,
          display_name: user_info_response.data.display_name || undefined,
          profile_color: user_info_response.data.profile_color || undefined,
          profile_picture: user_info_response.data.profile_picture || undefined,
        };

        if (is_adding_account) {
          await add_account(
            updated_user,
            vault,
            password,
            response.data.encrypted_vault,
            response.data.vault_nonce,
          );
        } else {
          await login(
            updated_user,
            vault,
            password,
            response.data.encrypted_vault,
            response.data.vault_nonce,
          );
        }
      } else {
        const basic_user = {
          id: response.data.user_id,
          username: response.data.username,
          email: response.data.email,
        };

        if (is_adding_account) {
          await add_account(
            basic_user,
            vault,
            password,
            response.data.encrypted_vault,
            response.data.vault_nonce,
          );
        } else {
          await login(
            basic_user,
            vault,
            password,
            response.data.encrypted_vault,
            response.data.vault_nonce,
          );
        }
      }
      if (is_adding_account) {
        navigate("/");
      } else {
        handle_navigation_after_login();
      }
    } catch (err) {
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
    }
  };

  if (totp_required) {
    return (
      <div
        className="fixed inset-0 overflow-y-auto transition-colors duration-200"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={use_backup_code ? "backup-code" : "totp"}
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
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {status}
                  </p>
                </div>
              ) : use_backup_code ? (
                <BackupCodeInput
                  on_cancel={handle_totp_cancel}
                  on_success={handle_totp_success}
                  on_use_authenticator={() => set_use_backup_code(false)}
                  pending_login_token={pending_login_token}
                />
              ) : (
                <TotpVerification
                  on_cancel={handle_totp_cancel}
                  on_success={handle_totp_success}
                  on_use_backup_code={() => set_use_backup_code(true)}
                  pending_login_token={pending_login_token}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 overflow-y-auto transition-colors duration-200"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key="signin"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm text-center"
            exit="exit"
            initial="initial"
            transition={page_transition}
            variants={page_variants}
          >
            {is_adding_account && is_authenticated && (
              <button
                className="self-start flex items-center gap-1 text-sm mb-6 transition-colors hover:opacity-80"
                style={{ color: "var(--text-tertiary)" }}
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

            <img alt="Aster" className="h-10" src="/text_logo.png" />

            <h1
              className="text-xl font-semibold mt-6"
              style={{ color: "var(--text-primary)" }}
            >
              {t("auth.sign_in_to_aster")}
            </h1>
            <p
              className="text-sm mt-2 leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              {t("auth.enter_credentials")}
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div
              className={`w-full ${error ? "mt-4" : "mt-6"} space-y-4 text-left`}
            >
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t("auth.username")}
                </label>
                <div
                  className="flex items-center rounded-lg border"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    borderColor: "var(--border-secondary)",
                  }}
                >
                  <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    autoComplete="username"
                    className="flex-1 min-w-0 h-11 px-4 text-sm bg-transparent outline-none"
                    disabled={is_loading}
                    placeholder="yourname"
                    style={{ color: "var(--text-primary)" }}
                    type="text"
                    value={username}
                    onChange={(e) =>
                      set_username(sanitize_username(e.target.value))
                    }
                  />
                </div>
                <div
                  className="relative flex mt-2 rounded-lg p-1"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    border: "1px solid var(--border-secondary)",
                  }}
                >
                  <div
                    className="absolute top-1 bottom-1 rounded-md transition-all duration-200 ease-out"
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
                    className="relative flex-1 h-8 rounded-md text-sm font-medium transition-colors duration-150"
                    disabled={is_loading}
                    style={{
                      color:
                        email_domain === "astermail.org"
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                    }}
                    type="button"
                    onClick={() => set_email_domain("astermail.org")}
                  >
                    @astermail.org
                  </button>
                  <button
                    className="relative flex-1 h-8 rounded-md text-sm font-medium transition-colors duration-150"
                    disabled={is_loading}
                    style={{
                      color:
                        email_domain === "aster.cx"
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                    }}
                    type="button"
                    onClick={() => set_email_domain("aster.cx")}
                  >
                    @aster.cx
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {t("auth.password")}
                  </label>
                  <Link
                    className="text-xs transition-colors hover:opacity-80"
                    style={{ color: "var(--text-tertiary)" }}
                    to="/forgot-password"
                  >
                    {t("auth.forgot_password")}
                  </Link>
                </div>
                <div
                  className="flex items-center rounded-lg border"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    borderColor: "var(--border-secondary)",
                  }}
                >
                  <input
                    autoComplete="current-password"
                    className="flex-1 min-w-0 h-11 px-4 text-sm bg-transparent outline-none"
                    disabled={is_loading}
                    maxLength={128}
                    placeholder={t("auth.enter_password_placeholder")}
                    style={{ color: "var(--text-primary)" }}
                    type={is_password_visible ? "text" : "password"}
                    value={password}
                    onChange={(e) => set_password(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !is_loading && handle_login()
                    }
                  />
                  <button
                    className="px-3 flex items-center justify-center focus:outline-none"
                    type="button"
                    onClick={() =>
                      set_is_password_visible(!is_password_visible)
                    }
                  >
                    {is_password_visible ? <EyeSlashIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <button
                  className="w-[18px] h-[18px] rounded flex items-center justify-center transition-colors border"
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
                      className="w-3 h-3 text-white"
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
                <span
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {t("auth.keep_signed_in")}
                  <span
                    className="text-xs ml-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    - {t("auth.secure_devices_only")}
                  </span>
                </span>
              </label>
            </div>

            <Button
              className="w-full mt-6"
              disabled={is_loading}
              size="lg"
              variant="primary"
              onClick={handle_login}
            >
              {is_loading ? (
                <>
                  <Spinner className="mr-2" size="sm" />
                  {t("auth.signing_in")}
                </>
              ) : (
                t("auth.sign_in")
              )}
            </Button>

            <Button
              asChild
              className="w-full mt-3"
              size="lg"
              variant="secondary"
            >
              <Link to="/register">{t("auth.create_account")}</Link>
            </Button>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
