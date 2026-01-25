import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

import { COPY_FEEDBACK_MS } from "@/constants/timings";
import { useTheme } from "@/contexts/theme_context";
import {
  derive_password_hash,
  generate_recovery_codes,
  encrypt_vault,
} from "@/services/crypto/key_manager";
import {
  hash_recovery_code,
  decrypt_recovery_key_with_code,
  decrypt_vault_backup,
  generate_recovery_key,
  encrypt_vault_backup,
  generate_all_recovery_shares,
  clear_recovery_key,
  VaultBackup,
} from "@/services/crypto/recovery_key";
import { initiate_recovery, complete_recovery } from "@/services/api/recovery";
import {
  generate_recovery_pdf,
  download_recovery_text,
} from "@/services/crypto/recovery_pdf";
import {
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

type RecoveryStep =
  | "email"
  | "code"
  | "password"
  | "processing"
  | "new_codes"
  | "success";

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

const PasswordStrengthIndicator = ({ password }: { password: string }) => {
  const get_strength = () => {
    if (!password) return { level: 0, label: "", color: "", suggestions: [] };

    let score = 0;
    const suggestions: string[] = [];

    if (password.length >= 8) score++;
    else suggestions.push("Use at least 8 characters");

    if (password.length >= 12) score++;
    else if (password.length >= 8)
      suggestions.push("Try 12+ characters for better security");

    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    else suggestions.push("Mix uppercase and lowercase letters");

    if (/[0-9]/.test(password)) score++;
    else suggestions.push("Add some numbers");

    if (/[^A-Za-z0-9]/.test(password)) score++;
    else if (score >= 2) suggestions.push("Add special characters (!@#$%)");

    if (score <= 1)
      return { level: 1, label: "Weak", color: "#ef4444", suggestions };
    if (score === 2)
      return { level: 2, label: "Fair", color: "#f59e0b", suggestions };
    if (score === 3)
      return { level: 3, label: "Good", color: "#22c55e", suggestions };

    return { level: 4, label: "Strong", color: "#22c55e", suggestions: [] };
  };

  const strength = get_strength();

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{
                backgroundColor:
                  i <= strength.level
                    ? strength.color
                    : "var(--border-secondary)",
              }}
            />
          ))}
        </div>
        <span className="text-xs" style={{ color: strength.color }}>
          {strength.label}
        </span>
      </div>
      {strength.suggestions.length > 0 && strength.level < 3 && (
        <p
          className="text-xs mt-1.5 text-left"
          style={{ color: "var(--text-muted)" }}
        >
          {strength.suggestions[0]}
        </p>
      )}
    </div>
  );
};

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const is_dark = theme === "dark";

  const [step, set_step] = useState<RecoveryStep>("code");
  const [email, set_email] = useState("");
  const [recovery_code, set_recovery_code] = useState("");
  const [password, set_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [is_password_visible, set_is_password_visible] = useState(false);
  const [is_confirm_visible, set_is_confirm_visible] = useState(false);
  const [error, set_error] = useState("");
  const [processing_status, set_processing_status] = useState("");
  const [new_recovery_codes, set_new_recovery_codes] = useState<string[]>([]);
  const [is_key_visible, set_is_key_visible] = useState(false);
  const [copy_success, set_copy_success] = useState(false);

  const [recovery_token, set_recovery_token] = useState("");
  const [vault_backup, set_vault_backup] = useState<VaultBackup | null>(null);
  const [code_salt, set_code_salt] = useState("");
  const [encrypted_recovery_key_data, set_encrypted_recovery_key_data] =
    useState<{ encrypted_key: string; nonce: string } | null>(null);

  const primary_button_class =
    "w-full h-11 rounded-lg font-medium text-sm transition-all duration-150";
  const secondary_button_class =
    "w-full h-11 rounded-lg font-medium text-sm transition-all duration-150";

  const get_primary_button_style = (is_hovered?: boolean) => ({
    background: is_dark
      ? "linear-gradient(to bottom, #ffffff, #f3f4f6)"
      : "linear-gradient(to bottom, rgb(82, 110, 249), rgb(55, 79, 235))",
    color: is_dark ? "#111827" : "#ffffff",
    boxShadow: is_dark
      ? "0 1px 2px rgba(0, 0, 0, 0.1)"
      : "0 1px 3px rgba(55, 79, 235, 0.3)",
    filter: is_hovered
      ? is_dark
        ? "brightness(0.95)"
        : "brightness(1.1)"
      : "none",
  });

  const get_secondary_button_style = (is_hovered?: boolean) => ({
    backgroundColor: is_dark
      ? is_hovered
        ? "rgba(255,255,255,0.12)"
        : "rgba(255,255,255,0.08)"
      : is_hovered
        ? "rgba(0,0,0,0.09)"
        : "rgba(0,0,0,0.06)",
    color: "var(--text-primary)",
    border: is_dark ? "none" : "1px solid rgba(0,0,0,0.1)",
  });

  const handle_email_next = () => {
    set_error("");
    if (!email.trim()) {
      set_error("Please enter your email address");

      return;
    }
    set_step("code");
  };

  const handle_code_submit = async () => {
    set_error("");

    const trimmed_code = recovery_code.toUpperCase().trim();

    if (!trimmed_code) {
      set_error("Please enter a recovery code");

      return;
    }

    if (!trimmed_code.startsWith("ASTER-")) {
      set_error("Recovery codes start with ASTER-");

      return;
    }

    set_step("processing");
    set_processing_status("Verifying recovery code...");

    try {
      const code_hash = await hash_recovery_code(trimmed_code);

      const response = await initiate_recovery(code_hash);

      if (response.error || !response.data) {
        await timing_safe_delay();
        set_error(response.error || "Invalid recovery code");
        set_step("code");

        return;
      }

      set_vault_backup({
        encrypted_data: response.data.encrypted_vault_backup,
        nonce: response.data.vault_backup_nonce,
        salt: response.data.recovery_key_salt,
      });
      set_code_salt(response.data.code_salt);
      set_encrypted_recovery_key_data({
        encrypted_key: response.data.encrypted_recovery_key,
        nonce: response.data.recovery_key_nonce,
      });
      set_recovery_token(response.data.recovery_token);

      set_step("password");
    } catch {
      await timing_safe_delay();
      set_error("Recovery failed. Please try again.");
      set_step("code");
    }
  };

  const handle_password_submit = async () => {
    set_error("");

    const password_validation = validate_password_strength(password);

    if (!password_validation.valid) {
      set_error(password_validation.errors[0]);

      return;
    }

    if (password !== confirm_password) {
      set_error("Passwords do not match");

      return;
    }

    if (!vault_backup || !encrypted_recovery_key_data || !code_salt) {
      set_error("Recovery session expired. Please start over.");
      set_step("email");

      return;
    }

    set_step("processing");
    set_processing_status("Decrypting your vault...");

    try {
      const recovery_key = await decrypt_recovery_key_with_code(
        {
          encrypted_key: encrypted_recovery_key_data.encrypted_key,
          nonce: encrypted_recovery_key_data.nonce,
          salt: code_salt,
        },
        recovery_code.toUpperCase().trim(),
      );

      set_processing_status("Recovering your account data...");
      const vault = await decrypt_vault_backup(vault_backup, recovery_key);

      set_processing_status("Generating new encryption keys...");
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const { hash: password_hash, salt: password_salt } =
        await derive_password_hash(password, salt);

      set_processing_status("Creating new recovery codes...");
      const new_codes = generate_recovery_codes(6);

      set_new_recovery_codes(new_codes);

      vault.recovery_codes = new_codes;

      set_processing_status("Encrypting vault with new password...");
      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        vault,
        password,
      );

      set_processing_status("Creating new recovery backup...");
      const new_recovery_key = generate_recovery_key();
      const new_backup = await encrypt_vault_backup(vault, new_recovery_key);
      const new_shares = await generate_all_recovery_shares(
        new_codes,
        new_recovery_key,
      );

      clear_recovery_key(recovery_key);
      clear_recovery_key(new_recovery_key);

      set_processing_status("Saving your new credentials...");
      const complete_response = await complete_recovery(
        recovery_token,
        password_hash,
        password_salt,
        encrypted_vault,
        vault_nonce,
        new_shares,
        new_backup.encrypted_data,
        new_backup.nonce,
        new_backup.salt,
      );

      if (complete_response.error || !complete_response.data?.success) {
        throw new Error(complete_response.error || "Recovery failed");
      }

      set_step("new_codes");
    } catch (err) {
      await timing_safe_delay();
      set_error(err instanceof Error ? err.message : "Recovery failed");
      set_step("password");
    }
  };

  const handle_copy_codes = async () => {
    const codes_text = new_recovery_codes.join("\n");

    await navigator.clipboard.writeText(codes_text);
    set_copy_success(true);
    setTimeout(() => set_copy_success(false), COPY_FEEDBACK_MS);
  };

  const handle_download_pdf = () => {
    generate_recovery_pdf(email, new_recovery_codes);
  };

  const handle_download_txt = () => {
    download_recovery_text(email, new_recovery_codes);
  };

  const render_step_content = () => {
    switch (step) {
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
              Recover your account
            </h1>
            <p
              className="text-sm mt-2 leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              Enter the email address associated with your Aster account.
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div className={`w-full ${error ? "mt-4" : "mt-6"}`}>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                autoComplete="email"
                className={input_base_class}
                placeholder="Email address"
                type="email"
                value={email}
                onChange={(e) => set_email(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handle_email_next()}
              />
            </div>

            <button
              className={`${primary_button_class} mt-6`}
              style={get_primary_button_style()}
              onClick={handle_email_next}
            >
              Continue
            </button>

            <Link
              className={`${secondary_button_class} mt-3 flex items-center justify-center`}
              style={get_secondary_button_style()}
              to="/sign-in"
            >
              Back to sign in
            </Link>
          </motion.div>
        );

      case "code":
        return (
          <motion.div
            key="code"
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
              Enter recovery code
            </h1>
            <p
              className="text-sm mt-2 leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              Enter one of your recovery codes to verify your identity.
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div className={`w-full ${error ? "mt-4" : "mt-6"}`}>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                autoComplete="off"
                className={input_base_class}
                placeholder="ASTER-XXXX-XXXX-XXXX"
                style={{ fontFamily: "monospace", letterSpacing: "0.5px" }}
                type="text"
                value={recovery_code}
                onChange={(e) =>
                  set_recovery_code(e.target.value.toUpperCase())
                }
                onKeyDown={(e) => e.key === "Enter" && handle_code_submit()}
              />
            </div>

            <button
              className={`${primary_button_class} mt-6`}
              style={get_primary_button_style()}
              onClick={handle_code_submit}
            >
              Verify code
            </button>

            <button
              className={`${secondary_button_class} mt-3`}
              style={get_secondary_button_style()}
              onClick={() => {
                set_error("");
                set_step("email");
              }}
            >
              Back
            </button>
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
              Create new password
            </h1>
            <p
              className="text-sm mt-2 leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              Choose a strong password to secure your account.
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
                  placeholder="New password"
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
                    onClick={() => set_is_confirm_visible(!is_confirm_visible)}
                  >
                    {is_confirm_visible ? <EyeSlashIcon /> : <EyeIcon />}
                  </button>
                }
                maxLength={128}
                placeholder="Confirm password"
                type={is_confirm_visible ? "text" : "password"}
                value={confirm_password}
                onChange={(e) => set_confirm_password(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handle_password_submit()}
              />
            </div>

            <button
              className={`${primary_button_class} mt-6`}
              style={get_primary_button_style()}
              onClick={handle_password_submit}
            >
              Reset password
            </button>

            <button
              className={`${secondary_button_class} mt-3`}
              style={get_secondary_button_style()}
              onClick={() => {
                set_error("");
                set_step("code");
              }}
            >
              Back
            </button>
          </motion.div>
        );

      case "processing":
        return (
          <motion.div
            key="processing"
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
              Recovering your account
            </h2>

            <p
              className="mt-3 text-sm"
              style={{ color: "var(--text-tertiary)" }}
            >
              {processing_status}
            </p>

            <p
              className="mt-8 text-xs max-w-xs leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              This may take a moment. Please don&apos;t close this window.
            </p>
          </motion.div>
        );

      case "new_codes":
        return (
          <motion.div
            key="new_codes"
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
              Save your new recovery codes
            </h1>
            <p
              className="text-sm mt-2 leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              Your old codes have been invalidated. Save these new codes
              securely.
            </p>

            <div className="w-full mt-6">
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  {new_recovery_codes.length} recovery codes
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
                {new_recovery_codes.map((code, index) => (
                  <div
                    key={index}
                    className="rounded-lg px-3 py-2.5 border text-center"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      borderColor: "var(--border-secondary)",
                    }}
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
                  </div>
                ))}
              </div>
            </div>

            <button
              className={`${primary_button_class} mt-6`}
              style={get_primary_button_style()}
              onClick={handle_download_pdf}
            >
              Download Key
            </button>

            <button
              className={`${secondary_button_class} mt-3`}
              style={get_secondary_button_style()}
              onClick={handle_download_txt}
            >
              Download as Text
            </button>

            <button
              className="w-full mt-6 text-sm transition-colors hover:opacity-80"
              style={{ color: "var(--text-tertiary)" }}
              onClick={() => set_step("success")}
            >
              Continue without downloading
            </button>
          </motion.div>
        );

      case "success":
        return (
          <motion.div
            key="success"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial="initial"
            transition={page_transition}
            variants={page_variants}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(34, 197, 94, 0.1)" }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M5 13l4 4L19 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1
              className="text-xl font-semibold mt-6"
              style={{ color: "var(--text-primary)" }}
            >
              Password reset successful
            </h1>
            <p
              className="text-sm mt-2 leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              Your account has been recovered. You can now sign in with your new
              password.
            </p>

            <button
              className={`${primary_button_class} mt-8`}
              style={get_primary_button_style()}
              onClick={() => navigate("/sign-in")}
            >
              Sign in
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
        <AnimatePresence mode="wait">{render_step_content()}</AnimatePresence>
      </div>
    </div>
  );
}
