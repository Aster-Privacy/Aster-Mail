import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  ClipboardDocumentIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { show_toast } from "@/components/toast/simple_toast";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  initiate_totp_setup,
  verify_totp_setup,
  TotpSetupInitiateResponse,
} from "@/services/api/totp";

interface TotpSetupModalProps {
  is_open: boolean;
  on_close: () => void;
  on_success: () => void;
}

type SetupStep = "qr_code" | "verify" | "backup_codes";

export function TotpSetupModal({
  is_open,
  on_close,
  on_success,
}: TotpSetupModalProps) {
  const [step, set_step] = useState<SetupStep>("qr_code");
  const [setup_data, set_setup_data] =
    useState<TotpSetupInitiateResponse | null>(null);
  const [verification_code, set_verification_code] = useState("");
  const [backup_codes, set_backup_codes] = useState<string[]>([]);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const input_refs = useRef<(HTMLInputElement | null)[]>([]);

  const reset_state = useCallback(() => {
    set_step("qr_code");
    set_setup_data(null);
    set_verification_code("");
    set_backup_codes([]);
    set_is_loading(false);
    set_error("");
  }, []);

  useEffect(() => {
    if (is_open && !setup_data) {
      initiate_setup();
    }
    if (!is_open) {
      reset_state();
    }
  }, [is_open, setup_data, reset_state]);

  const initiate_setup = async () => {
    set_is_loading(true);
    set_error("");

    const response = await initiate_totp_setup();

    if (response.error) {
      set_error(response.error);
      set_is_loading(false);

      return;
    }

    if (response.data) {
      set_setup_data(response.data);
    }

    set_is_loading(false);
  };

  const handle_verify = async () => {
    if (!setup_data || verification_code.length !== 6) return;

    set_is_loading(true);
    set_error("");

    const response = await verify_totp_setup({
      code: verification_code,
      setup_token: setup_data.setup_token,
    });

    if (response.error) {
      set_error(response.error);
      set_is_loading(false);

      return;
    }

    if (response.data) {
      set_backup_codes(response.data.backup_codes);
      set_step("backup_codes");
    }

    set_is_loading(false);
  };

  const handle_code_input = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const new_code = verification_code.split("");

    new_code[index] = value.slice(-1);
    const updated_code = new_code.join("").slice(0, 6);

    set_verification_code(updated_code);

    if (value && index < 5) {
      input_refs.current[index + 1]?.focus();
    }
  };

  const handle_key_down = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !verification_code[index] && index > 0) {
      input_refs.current[index - 1]?.focus();
    }
  };

  const handle_paste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    set_verification_code(pasted);
    const focus_index = Math.min(pasted.length, 5);

    input_refs.current[focus_index]?.focus();
  };

  const copy_secret = async () => {
    if (!setup_data) return;
    await navigator.clipboard.writeText(setup_data.secret);
    show_toast("Copied to clipboard", "success");
  };

  const copy_single_code = async (code: string) => {
    await navigator.clipboard.writeText(code);
    show_toast("Copied to clipboard", "success");
  };

  const copy_backup_codes = async () => {
    await navigator.clipboard.writeText(backup_codes.join("\n"));
    show_toast("Copied to clipboard", "success");
  };

  const handle_done = () => {
    on_success();
    on_close();
  };

  const render_qr_step = () => (
    <>
      <ModalHeader>
        <ModalTitle>Set Up Two-Factor Authentication</ModalTitle>
        <ModalDescription>
          Scan the QR code with your authenticator app (Google Authenticator,
          Authy, etc.)
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        {is_loading ? (
          <div className="flex items-center justify-center py-12">
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin"
              style={{
                borderColor: "var(--border-secondary)",
                borderTopColor: "#3b82f6",
              }}
            />
          </div>
        ) : error && !setup_data ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <ExclamationTriangleIcon className="w-12 h-12 text-red-500" />
            <p className="text-sm text-center text-red-500">{error}</p>
            <Button variant="secondary" onClick={initiate_setup}>
              Try Again
            </Button>
          </div>
        ) : setup_data ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div
                className="p-4 rounded-lg"
                style={{ backgroundColor: "#ffffff" }}
              >
                <QRCodeSVG
                  level="M"
                  size={180}
                  value={setup_data.otpauth_uri}
                />
              </div>
            </div>
            <div className="text-center">
              <p
                className="text-xs mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Can&apos;t scan? Enter this code manually:
              </p>
              <div className="flex items-center justify-center gap-2">
                <code
                  className="px-3 py-2 rounded-lg text-sm font-mono break-all"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {setup_data.secret}
                </code>
                <button
                  className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  type="button"
                  onClick={copy_secret}
                >
                  <ClipboardDocumentIcon
                    className="w-4 h-4"
                    style={{ color: "var(--text-muted)" }}
                  />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin"
              style={{
                borderColor: "var(--border-secondary)",
                borderTopColor: "#3b82f6",
              }}
            />
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={on_close}>
          Cancel
        </Button>
        <Button
          disabled={!setup_data}
          variant="primary"
          onClick={() => set_step("verify")}
        >
          Continue
        </Button>
      </ModalFooter>
    </>
  );

  const render_verify_step = () => (
    <>
      <ModalHeader>
        <ModalTitle>Verify Setup</ModalTitle>
        <ModalDescription>
          Enter the 6-digit code from your authenticator app to verify the setup
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div className="flex justify-center gap-2">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <input
                key={index}
                ref={(el) => {
                  input_refs.current[index] = el;
                }}
                className="w-11 h-14 text-center text-xl font-semibold rounded-lg border transition-colors outline-none"
                inputMode="numeric"
                maxLength={1}
                style={{
                  backgroundColor: "var(--input-bg)",
                  borderColor: "var(--input-border)",
                  color: "var(--text-primary)",
                }}
                type="text"
                value={verification_code[index] || ""}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--input-border)";
                }}
                onChange={(e) => handle_code_input(index, e.target.value)}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--accent-color)";
                }}
                onKeyDown={(e) => handle_key_down(index, e)}
                onPaste={handle_paste}
              />
            ))}
          </div>
          {error && <p className="text-sm text-center text-red-500">{error}</p>}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={() => set_step("qr_code")}>
          Back
        </Button>
        <Button
          disabled={verification_code.length !== 6 || is_loading}
          variant="primary"
          onClick={handle_verify}
        >
          {is_loading ? "Verifying..." : "Verify"}
        </Button>
      </ModalFooter>
    </>
  );

  const render_backup_codes_step = () => (
    <>
      <ModalHeader>
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheckIcon className="w-5 h-5 text-green-500" />
          <ModalTitle>Two-Factor Authentication Enabled</ModalTitle>
        </div>
        <ModalDescription>
          Save these backup codes in a secure place. You can use them to access
          your account if you lose your authenticator device.
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div
            className="p-4 rounded-lg border"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              {backup_codes.map((code, index) => (
                <button
                  key={index}
                  className="px-3 py-2 text-sm font-mono text-center rounded cursor-pointer transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                  type="button"
                  onClick={() => copy_single_code(code)}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <Button variant="secondary" onClick={copy_backup_codes}>
              <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
              Copy All Codes
            </Button>
          </div>
          <div
            className="flex items-start gap-2 p-3 rounded-lg border"
            style={{
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              borderColor: "rgba(59, 130, 246, 0.3)",
            }}
          >
            <ExclamationTriangleIcon
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              style={{ color: "#3b82f6" }}
            />
            <p className="text-xs" style={{ color: "#3b82f6" }}>
              Each backup code can only be used once. Store them securely and
              don&apos;t share them with anyone.
            </p>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={handle_done}>
          Done
        </Button>
      </ModalFooter>
    </>
  );

  return (
    <Modal
      close_on_overlay={false}
      is_open={is_open}
      on_close={on_close}
      size="md"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {step === "qr_code" && render_qr_step()}
          {step === "verify" && render_verify_step()}
          {step === "backup_codes" && render_backup_codes_step()}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
