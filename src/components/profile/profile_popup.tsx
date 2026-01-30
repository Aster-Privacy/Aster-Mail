import { AnimatePresence, motion } from "framer-motion";
import {
  XMarkIcon,
  EnvelopeIcon,
  ClipboardDocumentIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useCallback } from "react";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { get_email_username, get_email_domain } from "@/lib/utils";
import { ProfileNotesBox } from "@/components/profile/profile_notes_box";
import { Button } from "@/components/ui/button";
import { show_toast } from "@/components/toast/simple_toast";

interface ProfilePopupProps {
  is_open: boolean;
  on_close: () => void;
  email: string;
  name?: string;
  on_compose?: (email: string) => void;
  on_copy?: (text: string, label: string) => void;
}

export function ProfilePopup({
  is_open,
  on_close,
  email,
  name,
  on_compose,
  on_copy,
}: ProfilePopupProps) {
  const handle_copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(email);
      on_copy?.(email, "Email");
      show_toast("Email copied", "success");
    } catch {
      const textarea = document.createElement("textarea");

      textarea.value = email;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      on_copy?.(email, "Email");
      show_toast("Email copied", "success");
    }
  }, [email, on_copy]);

  const handle_compose = useCallback(() => {
    on_compose?.(email);
    on_close();
  }, [email, on_compose, on_close]);

  useEffect(() => {
    if (!is_open) return;

    const handle_keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        on_close();
      }
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, [is_open, on_close]);

  const display_name = name || get_email_username(email);
  const domain = get_email_domain(email);

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={on_close}
        >
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          />

          <motion.div
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative w-full max-w-[360px] rounded-xl border overflow-hidden"
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: 0.15, ease: [0.19, 1, 0.22, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "var(--border-secondary)" }}
            >
              <span
                className="text-[13px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Profile
              </span>
              <button
                className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                onClick={on_close}
              >
                <XMarkIcon
                  className="w-4 h-4"
                  style={{ color: "var(--text-muted)" }}
                />
              </button>
            </div>

            <div className="p-5">
              <div className="flex flex-col items-center text-center mb-5">
                <ProfileAvatar
                  use_domain_logo
                  className="mb-3 ring-2 ring-white dark:ring-zinc-800 shadow-md"
                  email={email}
                  name={display_name}
                  size="xl"
                />
                <h3
                  className="text-[16px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {display_name}
                </h3>
                {domain && (
                  <p
                    className="text-[12px] mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {domain}
                  </p>
                )}
              </div>

              <div
                className="flex items-center gap-3 p-3 rounded-xl mb-4"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <EnvelopeIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[11px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Email
                  </p>
                  <p
                    className="text-[13px] truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {email}
                  </p>
                </div>
                <button
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                  onClick={handle_copy}
                >
                  <ClipboardDocumentIcon
                    className="w-4 h-4"
                    style={{ color: "var(--text-muted)" }}
                  />
                </button>
              </div>

              <ProfileNotesBox email={email} />

              {on_compose && (
                <div
                  className="mt-4 pt-4 border-t"
                  style={{ borderColor: "var(--border-secondary)" }}
                >
                  <Button
                    className="w-full"
                    size="default"
                    variant="primary"
                    onClick={handle_compose}
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                    Send Email
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
