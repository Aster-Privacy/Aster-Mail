import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  EyeIcon,
  EyeSlashIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";

interface KeyRotationModalProps {
  is_open: boolean;
  on_close: () => void;
  on_rotate: (password: string) => Promise<boolean>;
  key_age_hours: number | null;
  key_fingerprint: string | null;
  is_manual?: boolean;
}

type RotationState = "idle" | "rotating" | "success" | "error";

export function KeyRotationModal({
  is_open,
  on_close,
  on_rotate,
  key_age_hours,
  key_fingerprint,
  is_manual = false,
}: KeyRotationModalProps) {
  const [password, set_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [state, set_state] = useState<RotationState>("idle");
  const [error, set_error] = useState("");

  useEffect(() => {
    if (is_open) {
      set_password("");
      set_error("");
      set_state("idle");
      set_show_password(false);
    }
  }, [is_open]);

  const format_key_age = (hours: number | null): string => {
    if (hours === null) return "Unknown";
    if (hours < 24) return `${hours} hours`;
    const days = Math.floor(hours / 24);

    if (days === 1) return "1 day";

    return `${days} days`;
  };

  const handle_submit = async () => {
    if (!password) {
      set_error("Please enter your password");

      return;
    }

    const password_copy = password;

    set_error("");
    set_state("rotating");
    set_password("");

    try {
      const success = await on_rotate(password_copy);

      if (success) {
        set_state("success");
        setTimeout(() => {
          on_close();
        }, 1500);
      } else {
        set_state("error");
        set_error("Rotation failed. Please check your password and try again.");
      }
    } catch (err) {
      set_state("error");
      set_error(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && password && state === "idle") {
      handle_submit();
    }
  };

  const handle_close = () => {
    if (state === "rotating") return;
    on_close();
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
            className="relative w-full max-w-[420px] rounded-xl border overflow-hidden"
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
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                  >
                    <ShieldCheckIcon
                      className="w-5 h-5"
                      style={{ color: "#3b82f6" }}
                    />
                  </div>
                  <div>
                    <h2
                      className="text-base font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {is_manual
                        ? "Rotate Encryption Keys"
                        : "Key Rotation Required"}
                    </h2>
                    <p
                      className="text-[13px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Forward secrecy protection
                    </p>
                  </div>
                </div>
                {state !== "rotating" && (
                  <button
                    className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    style={{ color: "var(--text-muted)" }}
                    type="button"
                    onClick={handle_close}
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              {state === "success" ? (
                <motion.div
                  animate={{ opacity: 1 }}
                  className="py-8 flex flex-col items-center"
                  initial={{ opacity: 0 }}
                >
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                    style={{ backgroundColor: "rgba(34, 197, 94, 0.1)" }}
                  >
                    <CheckCircleIcon className="w-8 h-8 text-green-500" />
                  </div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Keys rotated successfully
                  </p>
                  <p
                    className="text-[13px] mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Your encryption keys have been updated
                  </p>
                </motion.div>
              ) : (
                <>
                  <div
                    className="p-3 rounded-lg mb-4"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Current Key Age
                      </span>
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {format_key_age(key_age_hours)}
                      </span>
                    </div>
                    {key_fingerprint && (
                      <div className="flex justify-between items-center">
                        <span
                          className="text-[12px] font-medium"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Key Fingerprint
                        </span>
                        <span
                          className="text-[11px] font-mono"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {key_fingerprint}
                        </span>
                      </div>
                    )}
                  </div>

                  <p
                    className="text-[13px] mb-4"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {is_manual
                      ? "Enter your password to rotate your encryption keys. Old emails will remain readable."
                      : "Your encryption keys are due for rotation. Enter your password to generate new keys and maintain forward secrecy."}
                  </p>

                  <div>
                    <label
                      className="block text-sm font-medium mb-2"
                      htmlFor="rotation-password"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Password
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
                        className="flex-1 min-w-0 h-11 px-4 text-sm bg-transparent outline-none"
                        disabled={state === "rotating"}
                        id="rotation-password"
                        placeholder="Enter your password"
                        style={{ color: "var(--text-primary)" }}
                        type={show_password ? "text" : "password"}
                        value={password}
                        onChange={(e) => set_password(e.target.value)}
                        onKeyDown={handle_key_down}
                      />
                      <button
                        className="px-3 flex items-center justify-center focus:outline-none"
                        style={{ color: "var(--text-muted)" }}
                        type="button"
                        onClick={() => set_show_password(!show_password)}
                      >
                        {show_password ? (
                          <EyeSlashIcon className="w-5 h-5" />
                        ) : (
                          <EyeIcon className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div
                      className="flex items-center gap-2 mt-4 p-3 rounded-lg"
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                      }}
                    >
                      <ExclamationCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-[13px] text-red-500">{error}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {state !== "success" && (
              <div className="flex justify-end gap-3 px-6 pb-6">
                <Button
                  disabled={state === "rotating"}
                  size="lg"
                  variant="outline"
                  onClick={handle_close}
                >
                  {is_manual ? "Cancel" : "Later"}
                </Button>
                <Button
                  disabled={state === "rotating" || !password}
                  size="lg"
                  variant="primary"
                  onClick={handle_submit}
                >
                  {state === "rotating" && (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  )}
                  {state === "rotating" ? "Rotating..." : "Rotate Keys"}
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
