import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  EyeIcon,
  EyeSlashIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { use_protected_folder } from "@/hooks/use_protected_folder";

interface FolderPasswordModalProps {
  is_open: boolean;
  on_close: () => void;
  folder_id: string;
  folder_name: string;
  mode: "setup" | "unlock" | "settings";
  on_success?: () => void;
}

function get_password_strength(password: string): {
  level: number;
  label: string;
  color: string;
} {
  if (!password) return { level: 0, label: "", color: "" };

  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: "Weak", color: "#ef4444" };
  if (score === 2) return { level: 2, label: "Fair", color: "#f59e0b" };
  if (score === 3) return { level: 3, label: "Good", color: "#22c55e" };

  return { level: 4, label: "Strong", color: "#22c55e" };
}

function PasswordStrengthBar({ password }: { password: string }) {
  const strength = get_password_strength(password);

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-[11px] font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Password strength
        </span>
        <span
          className="text-[11px] font-medium"
          style={{ color: strength.color }}
        >
          {strength.label}
        </span>
      </div>
      <div className="flex gap-1">
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
    </div>
  );
}

function PasswordInput({
  value,
  on_change,
  placeholder,
  show_password,
  on_toggle_visibility,
  on_key_down,
  auto_focus = false,
  id,
}: {
  value: string;
  on_change: (value: string) => void;
  placeholder: string;
  show_password: boolean;
  on_toggle_visibility: () => void;
  on_key_down?: (e: React.KeyboardEvent) => void;
  auto_focus?: boolean;
  id?: string;
}) {
  return (
    <div
      className="flex items-center rounded-lg border"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        borderColor: "var(--border-secondary)",
      }}
    >
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={auto_focus}
        className="flex-1 min-w-0 h-11 px-4 text-sm bg-transparent outline-none"
        id={id}
        placeholder={placeholder}
        style={{ color: "var(--text-primary)" }}
        type={show_password ? "text" : "password"}
        value={value}
        onChange={(e) => on_change(e.target.value)}
        onKeyDown={on_key_down}
      />
      <button
        className="px-3 flex items-center justify-center focus:outline-none"
        style={{ color: "var(--text-muted)" }}
        type="button"
        onClick={on_toggle_visibility}
      >
        {show_password ? (
          <EyeSlashIcon className="w-5 h-5" />
        ) : (
          <EyeIcon className="w-5 h-5" />
        )}
      </button>
    </div>
  );
}

export function FolderPasswordModal({
  is_open,
  on_close,
  folder_id,
  folder_name,
  mode,
  on_success,
}: FolderPasswordModalProps) {
  const {
    is_loading,
    error: hook_error,
    unlock_folder,
    set_password,
    change_password,
    remove_password,
  } = use_protected_folder(folder_id);

  const [password, set_password_state] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [current_password, set_current_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [show_confirm, set_show_confirm] = useState(false);
  const [show_current, set_show_current] = useState(false);
  const [error, set_error] = useState("");
  const [internal_mode, set_internal_mode] = useState<
    "setup" | "unlock" | "change" | "remove"
  >(mode === "settings" ? "change" : mode);

  useEffect(() => {
    if (is_open) {
      set_internal_mode(mode === "settings" ? "change" : mode);
      set_password_state("");
      set_confirm_password("");
      set_current_password("");
      set_error("");
    }
  }, [is_open, mode]);

  useEffect(() => {
    if (hook_error) {
      set_error(hook_error);
    }
  }, [hook_error]);

  const strength = get_password_strength(password);

  const handle_submit = async () => {
    set_error("");

    if (internal_mode === "setup") {
      if (password.length < 8) {
        set_error("Password must be at least 8 characters");

        return;
      }
      if (password !== confirm_password) {
        set_error("Passwords do not match");

        return;
      }
      if (strength.level < 2) {
        set_error("Please choose a stronger password");

        return;
      }

      const success = await set_password(password);

      if (success) {
        on_success?.();
        on_close();
      }
    } else if (internal_mode === "unlock") {
      if (!password) {
        set_error("Please enter your password");

        return;
      }

      const success = await unlock_folder(password);

      if (success) {
        on_success?.();
        on_close();
      }
    } else if (internal_mode === "change") {
      if (!current_password) {
        set_error("Please enter your current password");

        return;
      }
      if (password.length < 8) {
        set_error("New password must be at least 8 characters");

        return;
      }
      if (password !== confirm_password) {
        set_error("New passwords do not match");

        return;
      }
      if (strength.level < 2) {
        set_error("Please choose a stronger new password");

        return;
      }

      const success = await change_password(current_password, password);

      if (success) {
        on_success?.();
        on_close();
      }
    } else if (internal_mode === "remove") {
      if (!password) {
        set_error("Please enter your password to confirm");

        return;
      }

      const success = await remove_password(password);

      if (success) {
        on_success?.();
        on_close();
      }
    }
  };

  const handle_close = () => {
    if (is_loading) return;
    on_close();
  };

  const render_setup_content = () => (
    <div className="space-y-4">
      <div
        className="flex items-start gap-3 p-3 rounded-lg"
        style={{
          backgroundColor: "rgba(251, 191, 36, 0.1)",
          border: "1px solid rgba(251, 191, 36, 0.2)",
        }}
      >
        <ExclamationTriangleIcon
          className="w-5 h-5 flex-shrink-0 mt-0.5"
          style={{ color: "#f59e0b" }}
        />
        <div>
          <p
            className="text-[13px] font-medium mb-0.5"
            style={{ color: "var(--text-primary)" }}
          >
            No password recovery
          </p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            If you forget this password, there is no way to recover access to
            this folder.
          </p>
        </div>
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2"
          htmlFor="setup-password"
          style={{ color: "var(--text-primary)" }}
        >
          Password
        </label>
        <PasswordInput
          auto_focus
          id="setup-password"
          on_change={set_password_state}
          on_key_down={(e) =>
            e.key === "Enter" && confirm_password && handle_submit()
          }
          on_toggle_visibility={() => set_show_password(!show_password)}
          placeholder="Enter a strong password"
          show_password={show_password}
          value={password}
        />
        <PasswordStrengthBar password={password} />
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2"
          htmlFor="setup-confirm-password"
          style={{ color: "var(--text-primary)" }}
        >
          Confirm Password
        </label>
        <PasswordInput
          id="setup-confirm-password"
          on_change={set_confirm_password}
          on_key_down={(e) => e.key === "Enter" && handle_submit()}
          on_toggle_visibility={() => set_show_confirm(!show_confirm)}
          placeholder="Re-enter your password"
          show_password={show_confirm}
          value={confirm_password}
        />
      </div>
    </div>
  );

  const render_unlock_content = () => (
    <div className="space-y-4">
      <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
        This folder is protected. Enter your password to access its contents.
      </p>

      <div>
        <label
          className="block text-sm font-medium mb-2"
          htmlFor="unlock-password"
          style={{ color: "var(--text-primary)" }}
        >
          Password
        </label>
        <PasswordInput
          auto_focus
          id="unlock-password"
          on_change={set_password_state}
          on_key_down={(e) => e.key === "Enter" && handle_submit()}
          on_toggle_visibility={() => set_show_password(!show_password)}
          placeholder="Enter your password"
          show_password={show_password}
          value={password}
        />
      </div>
    </div>
  );

  const render_change_content = () => (
    <div className="space-y-4">
      <div>
        <label
          className="block text-sm font-medium mb-2"
          htmlFor="change-current-password"
          style={{ color: "var(--text-primary)" }}
        >
          Current Password
        </label>
        <PasswordInput
          auto_focus
          id="change-current-password"
          on_change={set_current_password}
          on_toggle_visibility={() => set_show_current(!show_current)}
          placeholder="Enter current password"
          show_password={show_current}
          value={current_password}
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2"
          htmlFor="change-new-password"
          style={{ color: "var(--text-primary)" }}
        >
          New Password
        </label>
        <PasswordInput
          id="change-new-password"
          on_change={set_password_state}
          on_toggle_visibility={() => set_show_password(!show_password)}
          placeholder="Enter new password"
          show_password={show_password}
          value={password}
        />
        <PasswordStrengthBar password={password} />
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2"
          htmlFor="change-confirm-password"
          style={{ color: "var(--text-primary)" }}
        >
          Confirm New Password
        </label>
        <PasswordInput
          id="change-confirm-password"
          on_change={set_confirm_password}
          on_key_down={(e) => e.key === "Enter" && handle_submit()}
          on_toggle_visibility={() => set_show_confirm(!show_confirm)}
          placeholder="Re-enter new password"
          show_password={show_confirm}
          value={confirm_password}
        />
      </div>
    </div>
  );

  const render_remove_content = () => (
    <div className="space-y-4">
      <div
        className="flex items-start gap-3 p-3 rounded-lg"
        style={{
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
        }}
      >
        <ExclamationTriangleIcon
          className="w-5 h-5 flex-shrink-0 mt-0.5"
          style={{ color: "#ef4444" }}
        />
        <div>
          <p
            className="text-[13px] font-medium mb-0.5"
            style={{ color: "var(--text-primary)" }}
          >
            Remove password protection
          </p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Anyone with access to your account will be able to view this
            folder&apos;s contents.
          </p>
        </div>
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2"
          htmlFor="remove-password"
          style={{ color: "var(--text-primary)" }}
        >
          Enter password to confirm
        </label>
        <PasswordInput
          auto_focus
          id="remove-password"
          on_change={set_password_state}
          on_key_down={(e) => e.key === "Enter" && handle_submit()}
          on_toggle_visibility={() => set_show_password(!show_password)}
          placeholder="Enter your password"
          show_password={show_password}
          value={password}
        />
      </div>
    </div>
  );

  const get_title = () => {
    switch (internal_mode) {
      case "setup":
        return "Protect Folder";
      case "unlock":
        return "Unlock Folder";
      case "change":
        return "Change Password";
      case "remove":
        return "Remove Password";
      default:
        return "Folder Password";
    }
  };

  const get_submit_label = () => {
    switch (internal_mode) {
      case "setup":
        return "Set Password";
      case "unlock":
        return "Unlock";
      case "change":
        return "Update Password";
      case "remove":
        return "Remove Protection";
      default:
        return "Submit";
    }
  };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handle_close}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
          />
          <motion.div
            animate={{ opacity: 1 }}
            className="relative w-full max-w-[400px] rounded-xl border overflow-hidden"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2
                    className="text-base font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {get_title()}
                  </h2>
                  <p
                    className="text-[13px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {folder_name}
                  </p>
                </div>
                <button
                  className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onClick={handle_close}
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              {mode === "settings" && (
                <div
                  className="relative flex p-1 rounded-lg mb-4"
                  style={{ backgroundColor: "var(--bg-tertiary)" }}
                >
                  <motion.div
                    className="absolute top-1 bottom-1 rounded-md"
                    layoutId="tab-indicator"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                      width: "calc(50% - 4px)",
                      left: internal_mode === "change" ? 4 : "calc(50% + 0px)",
                    }}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                  />
                  <button
                    className="relative flex-1 py-2 px-3 text-[13px] font-medium transition-colors z-10"
                    style={{
                      color:
                        internal_mode === "change"
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                    }}
                    onClick={() => set_internal_mode("change")}
                  >
                    Change Password
                  </button>
                  <button
                    className="relative flex-1 py-2 px-3 text-[13px] font-medium transition-colors z-10"
                    style={{
                      color:
                        internal_mode === "remove"
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                    }}
                    onClick={() => set_internal_mode("remove")}
                  >
                    Remove Protection
                  </button>
                </div>
              )}

              {internal_mode === "setup" && render_setup_content()}
              {internal_mode === "unlock" && render_unlock_content()}
              {internal_mode === "change" && render_change_content()}
              {internal_mode === "remove" && render_remove_content()}

              {error && (
                <p className="text-[13px] text-red-500 mt-4">{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 pb-6">
              <Button
                disabled={is_loading}
                size="lg"
                variant="outline"
                onClick={handle_close}
              >
                Cancel
              </Button>
              <Button
                disabled={is_loading}
                size="lg"
                variant={internal_mode === "remove" ? "destructive" : "primary"}
                onClick={handle_submit}
              >
                {is_loading && (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                )}
                {is_loading ? "Processing..." : get_submit_label()}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
