import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExclamationTriangleIcon,
  TrashIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  FolderIcon,
  UsersIcon,
  Cog6ToothIcon,
  KeyIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

import { COPY_FEEDBACK_MS } from "@/constants/timings";
import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";

interface DeleteAccountModalProps {
  is_open: boolean;
  on_close: () => void;
  on_deleted: () => void;
}

type Step = "warning" | "final_confirmation";

const DELETION_ITEMS = [
  { icon: EnvelopeIcon, label: "All emails and conversations" },
  { icon: DocumentTextIcon, label: "Drafts and templates" },
  { icon: FolderIcon, label: "Custom folders and labels" },
  { icon: UsersIcon, label: "Contacts and address book" },
  { icon: Cog6ToothIcon, label: "Account preferences and settings" },
  { icon: KeyIcon, label: "Encryption keys and security data" },
];

const COUNTDOWN_SECONDS = 3;

export function DeleteAccountModal({
  is_open,
  on_close,
  on_deleted,
}: DeleteAccountModalProps) {
  const [step, set_step] = useState<Step>("warning");
  const [confirmation_text, set_confirmation_text] = useState("");
  const [countdown, set_countdown] = useState(COUNTDOWN_SECONDS);
  const [is_countdown_active, set_is_countdown_active] = useState(false);
  const [is_deleting, set_is_deleting] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const is_delete_typed = confirmation_text.toUpperCase() === "DELETE";

  const reset_state = useCallback(() => {
    set_step("warning");
    set_confirmation_text("");
    set_countdown(COUNTDOWN_SECONDS);
    set_is_countdown_active(false);
    set_is_deleting(false);
    set_error(null);
  }, []);

  useEffect(() => {
    if (!is_open) {
      reset_state();
    }
  }, [is_open, reset_state]);

  useEffect(() => {
    if (!is_countdown_active || countdown <= 0) return;

    const timer = setTimeout(() => {
      set_countdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [is_countdown_active, countdown]);

  const handle_proceed_to_final = () => {
    set_step("final_confirmation");
    set_is_countdown_active(true);
  };

  const handle_delete_account = async () => {
    set_is_deleting(true);
    set_error(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, COPY_FEEDBACK_MS));
      on_deleted();
      on_close();
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : "Failed to delete account. Please try again.",
      );
      set_is_deleting(false);
    }
  };

  const handle_close = () => {
    if (!is_deleting) {
      on_close();
    }
  };

  const render_warning_step = () => (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      initial={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
    >
      <ModalHeader>
        <ModalTitle>Delete Your Account</ModalTitle>
        <ModalDescription>
          This action is permanent and cannot be undone. All your data will be
          permanently removed.
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: "rgba(239, 68, 68, 0.08)" }}
          >
            <p
              className="text-[13px] font-medium mb-3"
              style={{ color: "#ef4444" }}
            >
              The following will be permanently deleted:
            </p>
            <ul className="space-y-2.5">
              {DELETION_ITEMS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "rgba(239, 68, 68, 0.12)" }}
                  >
                    <Icon
                      className="w-3.5 h-3.5"
                      style={{ color: "#ef4444" }}
                    />
                  </div>
                  <span
                    className="text-[13px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <label
              className="text-[13px] font-medium"
              htmlFor="delete-confirmation"
              style={{ color: "var(--text-secondary)" }}
            >
              Type{" "}
              <span style={{ color: "#ef4444", fontWeight: 600 }}>DELETE</span>{" "}
              to confirm
            </label>
            <input
              autoComplete="off"
              className="w-full h-10 px-3 rounded-lg text-[14px] transition-all duration-150 focus:outline-none focus:ring-2"
              id="delete-confirmation"
              placeholder="Type DELETE here"
              spellCheck={false}
              style={{
                backgroundColor: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--text-primary)",
              }}
              type="text"
              value={confirmation_text}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--input-border)";
                e.target.style.boxShadow = "none";
              }}
              onChange={(e) => set_confirmation_text(e.target.value)}
              onFocus={(e) => {
                e.target.style.borderColor = "#ef4444";
                e.target.style.boxShadow = "0 0 0 3px rgba(239, 68, 68, 0.15)";
              }}
            />
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button
          className="h-10 px-5 text-[14px] font-normal"
          variant="ghost"
          onClick={handle_close}
        >
          Cancel
        </Button>
        <Button
          className="h-10 px-5 text-[14px] font-normal bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.2)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.2)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] active:translate-y-px transition-all"
          disabled={!is_delete_typed}
          onClick={handle_proceed_to_final}
        >
          Continue
        </Button>
      </ModalFooter>
    </motion.div>
  );

  const render_final_step = () => (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      initial={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
    >
      <ModalHeader>
        <ModalTitle>Final Confirmation</ModalTitle>
        <ModalDescription>
          Are you absolutely sure? This will permanently delete your account and
          all associated data.
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          <div
            className="rounded-xl p-4 text-center"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            <div
              className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ backgroundColor: "rgba(239, 68, 68, 0.15)" }}
            >
              <ExclamationTriangleIcon
                className="w-8 h-8"
                style={{ color: "#ef4444" }}
              />
            </div>
            <p
              className="text-[15px] font-semibold mb-1"
              style={{ color: "#ef4444" }}
            >
              This action is irreversible
            </p>
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Once deleted, your account cannot be recovered
            </p>
          </div>

          {error && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg p-3"
              initial={{ opacity: 0, y: -10 }}
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              <p className="text-[13px]" style={{ color: "#ef4444" }}>
                {error}
              </p>
            </motion.div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button
          className="h-10 px-5 text-[14px] font-normal"
          disabled={is_deleting}
          variant="ghost"
          onClick={handle_close}
        >
          Go Back
        </Button>
        <Button
          className="h-10 px-5 text-[14px] font-normal bg-red-600 hover:bg-red-700 text-white disabled:bg-red-400 disabled:cursor-not-allowed relative overflow-hidden min-w-[140px] shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.2)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.2)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] active:translate-y-px transition-all"
          disabled={countdown > 0 || is_deleting}
          onClick={handle_delete_account}
        >
          {is_deleting ? (
            <span className="flex items-center gap-2">
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              Deleting...
            </span>
          ) : countdown > 0 ? (
            <span className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold"
                style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
              >
                {countdown}
              </span>
              Wait...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <TrashIcon className="w-4 h-4" />
              Delete Account
            </span>
          )}
        </Button>
      </ModalFooter>
    </motion.div>
  );

  return (
    <Modal
      close_on_overlay={!is_deleting}
      is_open={is_open}
      on_close={handle_close}
      show_close_button={!is_deleting}
      size="sm"
    >
      <AnimatePresence mode="wait">
        {step === "warning" ? (
          <div key="warning">{render_warning_step()}</div>
        ) : (
          <div key="final">{render_final_step()}</div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
