import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { COPY_FEEDBACK_MS } from "@/constants/timings";
import { PROFILE_COLORS, get_default_profile_color } from "@/constants/profile";
import { PlansComparison } from "@/components/common/plans_comparison";
import { Button } from "@/components/ui/button";
import { show_toast } from "@/components/toast/simple_toast";
import { useTheme } from "@/contexts/theme_context";
import { use_auth } from "@/contexts/auth_context";
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
import { create_checkout_session } from "@/services/api/billing";
import {
  encrypt_folder_field,
  generate_folder_token,
} from "@/hooks/use_folders";
import { save_recovery_email } from "@/services/api/recovery_email";
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
import {
  input_base_class,
  EyeIcon,
  EyeSlashIcon,
  InputWithEndContent,
  Logo,
} from "@/components/auth/auth_styles";
import { EMAIL_REGEX } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { PasswordStrengthIndicator } from "@/components/register/password_strength";
import {
  generate_random_username,
  generate_random_display_name,
} from "@/utils/random_generators";

const TRUSTED_REDIRECT_DOMAINS = ["checkout.stripe.com", "billing.stripe.com"];

function is_safe_redirect_url(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") return false;

    return TRUSTED_REDIRECT_DOMAINS.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

type RegistrationStep =
  | "welcome"
  | "email"
  | "password"
  | "plan"
  | "generating"
  | "recovery_key"
  | "recovery_email";

const page_variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
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

export default function RegisterPage() {
  const navigate = useNavigate();
  const [search_params] = useSearchParams();
  const { theme } = useTheme();
  const is_dark = theme === "dark";
  const {
    is_adding_account,
    set_is_adding_account,
    is_authenticated,
    login,
    vault,
    set_is_completing_registration,
  } = use_auth();

  useEffect(() => {
    document.title = "Register | Aster Mail";
  }, []);

  const get_referral_code = useCallback((): string | undefined => {
    const ref = search_params.get("ref");

    if (ref && ref.length === 8 && /^[A-Z0-9]+$/i.test(ref)) {
      return ref.toUpperCase();
    }

    return undefined;
  }, [search_params]);

  const handle_cancel_add_account = () => {
    set_is_adding_account(false);
    navigate("/");
  };

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
  const [generation_status, set_generation_status] = useState("");
  const [recovery_codes, set_recovery_codes] = useState<string[]>([]);
  const [generated_email, set_generated_email] = useState("");
  const [copy_success, set_copy_success] = useState(false);
  const [selected_plan, set_selected_plan] = useState<
    "free" | "starter" | "pro"
  >("free");
  const [show_comparison, set_show_comparison] = useState(false);
  const [is_pdf_downloaded, set_is_pdf_downloaded] = useState(false);
  const [is_text_downloaded, set_is_text_downloaded] = useState(false);
  const [show_skip_confirmation, set_show_skip_confirmation] = useState(false);

  const handle_generate_username = () => {
    set_username(generate_random_username());
    set_error("");
  };

  const handle_generate_display_name = () => {
    set_display_name(generate_random_display_name());
  };

  const validate_email_step = async (): Promise<boolean> => {
    const trimmed_username = sanitize_username(username);

    if (trimmed_username.length < 3) {
      await timing_safe_delay();
      set_error("Username must be at least 3 characters");

      return false;
    }
    if (trimmed_username.length > 40) {
      await timing_safe_delay();
      set_error("Username must be less than 40 characters");

      return false;
    }
    if (!/^[a-z0-9]+$/.test(trimmed_username)) {
      await timing_safe_delay();
      set_error("Username can only contain letters and numbers");

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
      set_error("Password must be less than 128 characters");

      return false;
    }
    if (password !== confirm_password) {
      await timing_safe_delay();
      set_error("Passwords do not match");

      return false;
    }

    return true;
  };

  const handle_email_next = async () => {
    set_error("");
    if (await validate_email_step()) {
      set_step("password");
    }
  };

  const handle_password_next = async () => {
    set_error("");
    if (await validate_password_step()) {
      set_step("plan");
    }
  };

  const handle_plan_next = async () => {
    await start_registration();
  };

  const start_registration = async () => {
    set_step("generating");
    const clean_username = sanitize_username(username);
    const email = `${clean_username}@${email_domain}`;

    set_generated_email(email);

    try {
      set_generation_status("Generating secure encryption keys...");
      const user_hash = await hash_email(email);
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const { hash: password_hash, salt: password_salt } =
        await derive_password_hash(password, salt);

      set_generation_status("Creating identity keypair...");
      const identity_keypair = await generate_identity_keypair(
        clean_username,
        email,
        password,
      );

      set_generation_status("Creating signed prekey...");
      const { keypair: signed_prekey, signature } =
        await generate_signed_prekey(
          clean_username,
          email,
          password,
          identity_keypair.private_key,
        );

      set_generation_status("Generating recovery codes...");
      const codes = generate_recovery_codes(6);

      set_recovery_codes(codes);

      set_generation_status("Encrypting your key vault...");
      const vault = {
        identity_key: identity_keypair.private_key,
        signed_prekey: signed_prekey.public_key,
        signed_prekey_private: signed_prekey.private_key,
        recovery_codes: codes,
      };
      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        vault,
        password,
      );

      set_generation_status("Creating recovery backup...");
      const recovery_key = generate_recovery_key();
      const vault_backup = await encrypt_vault_backup(vault, recovery_key);
      const recovery_shares = await generate_all_recovery_shares(
        codes,
        recovery_key,
      );

      clear_recovery_key(recovery_key);

      set_generation_status("Creating default folders...");
      const notes_token = generate_folder_token();
      const secure_token = generate_folder_token();

      const { encrypted: notes_name, nonce: notes_name_nonce } =
        await encrypt_folder_field("Notes", identity_keypair.private_key);
      const { encrypted: notes_color, nonce: notes_color_nonce } =
        await encrypt_folder_field("#3b82f6", identity_keypair.private_key);

      const { encrypted: secure_name, nonce: secure_name_nonce } =
        await encrypt_folder_field("Secure", identity_keypair.private_key);
      const { encrypted: secure_color, nonce: secure_color_nonce } =
        await encrypt_folder_field("#10b981", identity_keypair.private_key);

      set_generation_status("Preparing PGP encryption key...");
      const pgp_key_data = await prepare_pgp_key_data(
        identity_keypair,
        password,
      );

      const default_folders = [
        {
          label_token: notes_token,
          encrypted_name: notes_name,
          name_nonce: notes_name_nonce,
          encrypted_color: notes_color,
          color_nonce: notes_color_nonce,
          sort_order: 0,
          folder_type: "default_open",
          is_password_protected: false,
        },
        {
          label_token: secure_token,
          encrypted_name: secure_name,
          name_nonce: secure_name_nonce,
          encrypted_color: secure_color,
          color_nonce: secure_color_nonce,
          sort_order: 1,
          folder_type: "default_secure",
          is_password_protected: true,
        },
      ];

      set_generation_status("Creating your account...");
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
        default_folders,
        remember_me,
        referral_code: get_referral_code(),
        encrypted_vault_backup: vault_backup.encrypted_data,
        vault_backup_nonce: vault_backup.nonce,
        recovery_key_salt: vault_backup.salt,
        recovery_shares,
        pgp_key: pgp_key_data,
      });

      if (response.error) {
        await timing_safe_delay();
        set_error(response.error);
        set_step("email");

        return;
      }

      if (response.data) {
        set_is_completing_registration(true);
        await login(
          {
            id: response.data.user_id,
            username: response.data.username,
            email: response.data.email,
            display_name: trimmed_display_name || undefined,
            profile_color,
          },
          vault,
          password,
          encrypted_vault,
          vault_nonce,
        );
      }

      set_step("recovery_key");
    } catch (err) {
      await timing_safe_delay();
      set_error(err instanceof Error ? err.message : "Registration failed");
      set_step("email");
    }
  };

  const handle_copy_codes = async () => {
    const codes_text = recovery_codes.join("\n");

    await navigator.clipboard.writeText(codes_text);
    set_copy_success(true);
    setTimeout(() => set_copy_success(false), COPY_FEEDBACK_MS);
  };

  const handle_copy_single_code = async (code: string) => {
    await navigator.clipboard.writeText(code);
    show_toast("Recovery code copied", "success");
  };

  const handle_download_key = () => {
    generate_recovery_pdf(generated_email, recovery_codes);
    set_is_pdf_downloaded(true);
  };

  const handle_download_txt = () => {
    download_recovery_text(generated_email, recovery_codes);
    set_is_text_downloaded(true);
  };

  const [is_saving_recovery_email, set_is_saving_recovery_email] =
    useState(false);
  const [recovery_email_error, set_recovery_email_error] = useState("");

  const validate_email = (email: string): boolean => {
    return EMAIL_REGEX.test(email);
  };

  const complete_registration = async () => {
    localStorage.setItem("show_onboarding", "true");

    if (vault) {
      try {
        await save_preferences(
          { ...DEFAULT_PREFERENCES, profile_color },
          vault,
        );
      } catch {
        // Continue even if preferences save fails
      }
    }

    if (selected_plan !== "free") {
      try {
        const result = await create_checkout_session(selected_plan, "month");

        if (result.data?.url && is_safe_redirect_url(result.data.url)) {
          set_is_completing_registration(false);
          window.location.href = result.data.url;

          return;
        }
      } catch {
        // Continue to navigate home on checkout error
      }
    }

    navigate("/");
    setTimeout(() => set_is_completing_registration(false), 100);
  };

  const handle_recovery_email_continue = async () => {
    set_recovery_email_error("");

    if (!recovery_email.trim()) {
      set_recovery_email_error("Please enter a recovery email address");

      return;
    }

    if (!validate_email(recovery_email.trim())) {
      set_recovery_email_error("Please enter a valid email address");

      return;
    }

    if (vault) {
      set_is_saving_recovery_email(true);
      try {
        await save_recovery_email(recovery_email.trim(), vault);
      } catch {
        return;
      }
      set_is_saving_recovery_email(false);
    }

    await complete_registration();
  };

  const handle_recovery_email_skip = async () => {
    await complete_registration();
  };

  const render_step_content = () => {
    switch (step) {
      case "welcome":
        return (
          <motion.div
            key="welcome"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
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
                Back to inbox
              </button>
            )}

            <Logo />

            <h1
              className="text-2xl font-bold mt-6"
              style={{ color: "var(--text-primary)" }}
            >
              Create your Aster account
            </h1>
            <p
              className="text-sm mt-3 leading-relaxed max-w-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              One account for all Aster services. End-to-end encrypted by
              default.
            </p>

            <div className="w-full mt-8 space-y-3">
              <Button
                className="w-full"
                size="lg"
                variant="primary"
                onClick={() => set_step("email")}
              >
                Create free account
              </Button>

              <Button asChild className="w-full" size="lg" variant="secondary">
                <Link to="/sign-in">Sign in to existing account</Link>
              </Button>
            </div>

            <p
              className="text-xs mt-6 leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              By continuing, you agree to our{" "}
              <Link
                className="underline transition-colors hover:opacity-80"
                style={{ color: "var(--accent-blue)" }}
                to="/terms"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                className="underline transition-colors hover:opacity-80"
                style={{ color: "var(--accent-blue)" }}
                to="/privacy"
              >
                Privacy Policy
              </Link>
              . Copyright {new Date().getFullYear()} Aster.
            </p>
          </motion.div>
        );

      case "email":
        return (
          <motion.div
            key="email"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial="initial"
            transition={page_transition}
            variants={page_variants}
          >
            <Logo />

            <h1
              className="text-xl font-semibold mt-6"
              style={{ color: "var(--text-primary)" }}
            >
              Choose your email address
            </h1>
            <p
              className="text-sm mt-2 leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              Pick a unique username with letters and numbers. Minimum 3
              characters.
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div className={`w-full ${error ? "mt-4" : "mt-6"} space-y-4`}>
              <div>
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
                    maxLength={40}
                    placeholder="New email address"
                    style={{ color: "var(--text-primary)" }}
                    type="text"
                    value={username}
                    onChange={(e) =>
                      set_username(sanitize_username(e.target.value))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handle_email_next()}
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
                <button
                  className="mt-1 -ml-2 px-2 py-1.5 text-xs font-medium transition-colors hover:opacity-80 flex items-center gap-1.5 rounded-md"
                  style={{ color: "var(--accent-blue)" }}
                  type="button"
                  onClick={handle_generate_username}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Generate random username
                </button>
              </div>

              <div>
                <input
                  autoComplete="name"
                  className="w-full h-11 px-4 text-sm rounded-lg border outline-none transition-colors"
                  maxLength={64}
                  placeholder="Display name (optional)"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    borderColor: "var(--border-secondary)",
                    color: "var(--text-primary)",
                  }}
                  type="text"
                  value={display_name}
                  onChange={(e) => set_display_name(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handle_email_next()}
                />
                <button
                  className="mt-1 -ml-2 px-2 py-1.5 text-xs font-medium transition-colors hover:opacity-80 flex items-center gap-1.5 rounded-md"
                  style={{ color: "var(--accent-blue)" }}
                  type="button"
                  onClick={handle_generate_display_name}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Generate random display name
                </button>
              </div>

              <div>
                <p
                  className="text-xs font-medium text-left mb-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Profile color
                </p>
                <div className="flex items-center gap-2">
                  {PROFILE_COLORS.map((color) => (
                    <button
                      key={color}
                      className="w-8 h-8 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
                      style={{
                        backgroundColor: color,
                        boxShadow:
                          profile_color === color
                            ? `0 0 0 2px var(--bg-secondary), 0 0 0 4px ${color}`
                            : "none",
                      }}
                      type="button"
                      onClick={() => set_profile_color(color)}
                    >
                      {profile_color === color && (
                        <svg
                          className="w-4 h-4 text-white"
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
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-3 select-none">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                    style={{
                      backgroundColor: profile_color,
                      fontFamily: "Google Sans Flex",
                    }}
                  >
                    {(() => {
                      const name = display_name || username || "A";
                      const parts = name.trim().split(/\s+/);

                      if (parts.length === 1) {
                        return parts[0].charAt(0).toUpperCase();
                      }

                      return (
                        parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
                      ).toUpperCase();
                    })()}
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Preview of your profile avatar
                  </p>
                </div>
              </div>
            </div>

            <Button
              className="w-full mt-6"
              size="lg"
              variant="primary"
              onClick={handle_email_next}
            >
              Next
            </Button>

            <Button
              className="w-full mt-3"
              size="lg"
              variant="secondary"
              onClick={() => {
                set_error("");
                set_step("welcome");
              }}
            >
              Back
            </Button>
          </motion.div>
        );

      case "password":
        return (
          <motion.div
            key="password"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial="initial"
            transition={page_transition}
            variants={page_variants}
          >
            <Logo />

            <h1
              className="text-xl font-semibold mt-6"
              style={{ color: "var(--text-primary)" }}
            >
              Secure your account
            </h1>
            <p
              className="text-sm mt-2 leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              Create a strong password. This will encrypt all your emails
              locally.
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
                  placeholder="Password"
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
                    onClick={() =>
                      set_is_confirm_password_visible(
                        !is_confirm_password_visible,
                      )
                    }
                  >
                    {is_confirm_password_visible ? (
                      <EyeSlashIcon />
                    ) : (
                      <EyeIcon />
                    )}
                  </button>
                }
                maxLength={128}
                placeholder="Confirm password"
                type={is_confirm_password_visible ? "text" : "password"}
                value={confirm_password}
                onChange={(e) => set_confirm_password(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handle_password_next()}
              />
            </div>

            <div className="w-full space-y-3 mt-4">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <button
                  className="w-[18px] h-[18px] rounded flex items-center justify-center transition-colors border"
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
                  Keep me signed in
                  <span
                    className="text-xs ml-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    - only on secure devices
                  </span>
                </span>
              </label>
            </div>

            <Button
              className="w-full mt-6"
              size="lg"
              variant="primary"
              onClick={handle_password_next}
            >
              Next
            </Button>

            <Button
              className="w-full mt-3"
              size="lg"
              variant="secondary"
              onClick={() => {
                set_error("");
                set_step("email");
              }}
            >
              Back
            </Button>
          </motion.div>
        );

      case "plan": {
        if (show_comparison) {
          return (
            <PlansComparison
              on_back={() => set_show_comparison(false)}
              on_continue={handle_plan_next}
              on_select={set_selected_plan}
              selected_plan={selected_plan}
            />
          );
        }

        const plans = [
          {
            code: "starter" as const,
            badge: "Starter",
            price: "$10",
            period: "/mo",
            subtitle: "Perfect for personal use",
            features: [
              { icon: "mail", text: "End-to-end encrypted inbox" },
              { icon: "storage", text: "10 GB secure storage" },
              { icon: "shield", text: "5 email aliases" },
              { icon: "send", text: "2 custom domains" },
              { icon: "block", text: "50 MB attachments" },
            ],
          },
          {
            code: "free" as const,
            badge: "Personal",
            price: "Free",
            period: "",
            subtitle: "Everything you need to get started",
            features: [
              { icon: "mail", text: "End-to-end encrypted inbox" },
              { icon: "storage", text: "1 GB secure storage" },
              { icon: "shield", text: "Zero-knowledge encryption" },
              { icon: "send", text: "Unlimited emails" },
              { icon: "block", text: "No ads, no tracking" },
            ],
            featured: true,
          },
          {
            code: "pro" as const,
            badge: "Pro",
            price: "$20",
            period: "/mo",
            subtitle: "For power users",
            features: [
              { icon: "mail", text: "End-to-end encrypted inbox" },
              { icon: "storage", text: "50 GB secure storage" },
              { icon: "shield", text: "10 email aliases" },
              { icon: "send", text: "5 custom domains" },
              { icon: "block", text: "100 MB attachments" },
            ],
          },
        ];

        const get_feature_icon = (icon: string) => {
          switch (icon) {
            case "mail":
              return (
                <path
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            case "storage":
              return (
                <path
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            case "shield":
              return (
                <path
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            case "send":
              return (
                <path
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            case "block":
              return (
                <path
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            default:
              return null;
          }
        };

        return (
          <motion.div
            key="plan"
            animate="animate"
            className="flex flex-col items-center w-full max-w-4xl px-4"
            exit="exit"
            initial="initial"
            transition={page_transition}
            variants={page_variants}
          >
            <div className="text-center mb-8">
              <h1
                className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Choose your plan
              </h1>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              {plans.map((plan) => {
                const is_selected = selected_plan === plan.code;
                const is_featured = plan.featured;

                return (
                  <button
                    key={plan.code}
                    className="w-full rounded-2xl border-2 overflow-hidden text-left transition-all flex flex-col"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: is_selected
                        ? "var(--accent-blue)"
                        : "var(--border-primary)",
                    }}
                    onClick={() => set_selected_plan(plan.code)}
                  >
                    <div
                      className="px-6 pt-6 pb-5 text-center"
                      style={{
                        background: is_featured
                          ? is_dark
                            ? "linear-gradient(to bottom, rgba(82, 110, 249, 0.1), transparent)"
                            : "linear-gradient(to bottom, rgba(82, 110, 249, 0.06), transparent)"
                          : "transparent",
                      }}
                    >
                      {is_featured && (
                        <div
                          className="inline-flex px-3 py-1 rounded-full text-xs font-medium mb-4"
                          style={{
                            backgroundColor: is_dark
                              ? "rgba(82, 110, 249, 0.15)"
                              : "rgba(82, 110, 249, 0.08)",
                            color: "var(--accent-blue)",
                            border: `1px solid ${is_dark ? "rgba(82, 110, 249, 0.3)" : "rgba(82, 110, 249, 0.2)"}`,
                          }}
                        >
                          {plan.badge}
                        </div>
                      )}
                      {!is_featured && (
                        <div
                          className="inline-flex px-3 py-1 rounded-full text-xs font-medium mb-4"
                          style={{
                            backgroundColor: is_dark
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(0,0,0,0.04)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {plan.badge}
                        </div>
                      )}

                      <div className="h-12 flex flex-col items-center justify-center">
                        <div className="flex items-baseline gap-1">
                          <span
                            className="text-4xl font-bold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {plan.price}
                          </span>
                          {plan.period && (
                            <span
                              className="text-lg"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {plan.period}
                            </span>
                          )}
                        </div>
                      </div>

                      <p
                        className="text-sm mt-2"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {plan.subtitle}
                      </p>
                    </div>

                    <div
                      className="px-6 pb-6 flex-1"
                      style={{
                        borderTop: `1px solid ${is_dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                      }}
                    >
                      <div className="pt-5 space-y-3">
                        {plan.features.map((feature, index) => (
                          <div key={index} className="flex items-center gap-3">
                            <svg
                              className="w-4 h-4 flex-shrink-0"
                              fill="none"
                              stroke={
                                is_featured
                                  ? "var(--accent-blue)"
                                  : "var(--text-tertiary)"
                              }
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              {get_feature_icon(feature.icon)}
                            </svg>
                            <span
                              className="text-sm"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {feature.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              className="mt-4 text-sm transition-colors hover:opacity-80"
              style={{ color: "var(--accent-blue)" }}
              onClick={() => set_show_comparison(true)}
            >
              Compare all features
            </button>

            <Button
              className="w-full mt-6 max-w-sm"
              size="lg"
              variant="primary"
              onClick={handle_plan_next}
            >
              Continue
            </Button>

            <button
              className="mt-6 text-sm transition-colors hover:opacity-80 flex items-center gap-1"
              style={{ color: "var(--text-tertiary)" }}
              onClick={() => set_step("password")}
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
              Back
            </button>
          </motion.div>
        );
      }

      case "generating": {
        const steps = [
          "Generating secure encryption keys...",
          "Creating identity keypair...",
          "Creating signed prekey...",
          "Generating recovery codes...",
          "Encrypting your key vault...",
          "Creating your account...",
        ];
        const current_step_index = steps.findIndex((s) =>
          generation_status
            .toLowerCase()
            .includes(s.toLowerCase().split("...")[0].toLowerCase()),
        );
        const progress =
          current_step_index >= 0
            ? ((current_step_index + 1) / steps.length) * 100
            : 10;

        return (
          <motion.div
            key="generating"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial="initial"
            transition={page_transition}
            variants={page_variants}
          >
            <ArrowPathIcon className="h-10 w-10 animate-spin text-blue-500" />

            <h2
              className="text-xl font-semibold mt-8"
              style={{ color: "var(--text-primary)" }}
            >
              Setting up your account
            </h2>

            <p
              className="mt-3 text-sm"
              style={{ color: "var(--text-tertiary)" }}
            >
              {generation_status}
            </p>

            <div className="w-full mt-8">
              <div
                className="h-1 w-full rounded-full overflow-hidden"
                style={{
                  backgroundColor: is_dark
                    ? "rgba(255, 255, 255, 0.1)"
                    : "rgba(0, 0, 0, 0.08)",
                }}
              >
                <motion.div
                  animate={{ width: `${progress}%` }}
                  className="h-full rounded-full"
                  initial={{ width: "0%" }}
                  style={{
                    backgroundColor: is_dark ? "#60a5fa" : "#3b82f6",
                  }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
            </div>

            <p
              className="mt-8 text-xs max-w-xs leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              Your encryption keys are being generated locally. This ensures
              only you can access your data.
            </p>
          </motion.div>
        );
      }

      case "recovery_key": {
        return (
          <motion.div
            key="recovery_key"
            animate="animate"
            className="flex flex-col items-center w-full max-w-md px-4 text-center"
            exit="exit"
            initial="initial"
            transition={page_transition}
            variants={page_variants}
          >
            <Logo />

            <h1
              className="text-xl font-semibold mt-6"
              style={{ color: "var(--text-primary)" }}
            >
              Save your recovery codes
            </h1>
            <p
              className="text-sm mt-2 leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              Store these codes safely. They&apos;re the only way to recover
              your account if you lose your password.
            </p>

            <div className="w-full mt-6">
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  {recovery_codes.length} recovery codes
                </span>
                <div className="flex items-center gap-1">
                  <button
                    className="p-1.5 rounded transition-colors hover:opacity-80"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() => set_is_key_visible(!is_key_visible)}
                  >
                    {is_key_visible ? <EyeSlashIcon /> : <EyeIcon />}
                  </button>
                  <button
                    className="p-1.5 rounded transition-colors hover:opacity-80"
                    style={{
                      color: copy_success ? "#22c55e" : "var(--text-muted)",
                    }}
                    onClick={handle_copy_codes}
                  >
                    <CopyIcon />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {recovery_codes.map((code, index) => (
                  <button
                    key={index}
                    className="rounded-lg px-3 py-2.5 border text-center transition-colors hover:opacity-80"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      borderColor: "var(--border-secondary)",
                    }}
                    onClick={() =>
                      is_key_visible && handle_copy_single_code(code)
                    }
                  >
                    <span
                      className="text-xs font-mono"
                      style={{
                        color: "var(--text-primary)",
                        filter: is_key_visible ? "none" : "blur(4px)",
                        userSelect: is_key_visible ? "text" : "none",
                      }}
                    >
                      {code}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full mt-6"
              size="lg"
              variant="primary"
              onClick={handle_download_key}
            >
              Download Key
            </Button>

            <Button
              className="w-full mt-3"
              size="lg"
              variant="secondary"
              onClick={handle_download_txt}
            >
              Download as Text
            </Button>

            <button
              className="w-full mt-6 text-sm transition-colors hover:opacity-80"
              style={{ color: "var(--text-tertiary)" }}
              onClick={() => {
                if (is_pdf_downloaded || is_text_downloaded) {
                  set_step("recovery_email");
                } else {
                  set_show_skip_confirmation(true);
                }
              }}
            >
              {is_pdf_downloaded || is_text_downloaded
                ? "Continue"
                : "Continue without downloading"}
            </button>

            <ConfirmationModal
              cancel_text="Go back"
              confirm_text="Continue anyway"
              is_open={show_skip_confirmation}
              message="Your recovery codes are the ONLY way to regain access to your account if you forget your password. Without them, your encrypted data will be permanently lost. Are you sure you want to continue without saving them?"
              on_cancel={() => set_show_skip_confirmation(false)}
              on_confirm={() => {
                set_show_skip_confirmation(false);
                set_step("recovery_email");
              }}
              title="Are you sure?"
              variant="warning"
            />
          </motion.div>
        );
      }

      case "recovery_email":
        return (
          <motion.div
            key="recovery_email"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial="initial"
            transition={page_transition}
            variants={page_variants}
          >
            <Logo />

            <h1
              className="text-xl font-semibold mt-6"
              style={{ color: "var(--text-primary)" }}
            >
              Add a backup email
            </h1>
            <p
              className="text-sm mt-2 leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              Optional: Add an external email for account recovery if you ever
              lose access.
            </p>

            <AnimatePresence>
              {recovery_email_error && (
                <Alert is_dark={is_dark} message={recovery_email_error} />
              )}
            </AnimatePresence>

            <div className={`w-full ${recovery_email_error ? "mt-4" : "mt-6"}`}>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                autoComplete="email"
                className={input_base_class}
                disabled={is_saving_recovery_email}
                placeholder="backup@email.com"
                type="email"
                value={recovery_email}
                onChange={(e) => {
                  set_recovery_email(e.target.value);
                  if (recovery_email_error) set_recovery_email_error("");
                }}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  !is_saving_recovery_email &&
                  handle_recovery_email_continue()
                }
              />
            </div>

            <Button
              className="w-full mt-6"
              disabled={is_saving_recovery_email}
              size="lg"
              variant="primary"
              onClick={handle_recovery_email_continue}
            >
              {is_saving_recovery_email ? "Saving..." : "Continue"}
            </Button>

            <button
              className="w-full mt-4 text-sm transition-colors hover:opacity-80"
              disabled={is_saving_recovery_email}
              style={{
                color: "var(--text-tertiary)",
                opacity: is_saving_recovery_email ? 0.5 : 1,
                cursor: is_saving_recovery_email ? "not-allowed" : "pointer",
              }}
              onClick={handle_recovery_email_skip}
            >
              Skip for now
            </button>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className="fixed inset-0 overflow-y-auto transition-colors duration-200"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <ErrorBoundary>
          <AnimatePresence mode="wait">{render_step_content()}</AnimatePresence>
        </ErrorBoundary>
      </div>
    </div>
  );
}
