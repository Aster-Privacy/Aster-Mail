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
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  ClipboardDocumentIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { show_toast } from "@/components/toast/simple_toast";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import {
  initiate_totp_setup,
  verify_totp_setup,
  TotpSetupInitiateResponse,
} from "@/services/api/totp";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

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
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [step, set_step] = useState<SetupStep>("qr_code");
  const [setup_data, set_setup_data] =
    useState<TotpSetupInitiateResponse | null>(null);
  const [verification_code, set_verification_code] = useState("");
  const [backup_codes, set_backup_codes] = useState<string[]>([]);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const input_ref = useRef<HTMLInputElement>(null);
  const verifying_ref = useRef(false);

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

  useEffect(() => {
    if (step === "verify") {
      input_ref.current?.focus();
    }
  }, [step]);

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
    if (!setup_data || verification_code.length !== 6 || verifying_ref.current)
      return;

    verifying_ref.current = true;
    set_is_loading(true);
    set_error("");

    const response = await verify_totp_setup({
      code: verification_code,
      setup_token: setup_data.setup_token,
    });

    if (response.error) {
      set_error(response.error);
      verifying_ref.current = false;
      set_is_loading(false);
      input_ref.current?.focus();
      input_ref.current?.select();

      return;
    }

    if (response.data) {
      set_backup_codes(response.data.backup_codes);
      set_step("backup_codes");
    }

    verifying_ref.current = false;
    set_is_loading(false);
  };

  const handle_code_change = (value: string) => {
    set_verification_code(value.replace(/\D/g, "").slice(0, 6));
    if (error) set_error("");
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e["key"] === "Enter") handle_verify();
  };

  const copy_secret = async () => {
    if (!setup_data) return;
    await navigator.clipboard.writeText(setup_data.secret);
    show_toast(t("common.copied_to_clipboard"), "success");
  };

  const copy_single_code = async (code: string) => {
    await navigator.clipboard.writeText(code);
    show_toast(t("common.copied_to_clipboard"), "success");
  };

  const copy_backup_codes = async () => {
    await navigator.clipboard.writeText(backup_codes.join("\n"));
    show_toast(t("common.copied_to_clipboard"), "success");
  };

  const handle_done = () => {
    on_success();
    on_close();
  };

  const render_qr_step = () => (
    <>
      <ModalHeader>
        <ModalTitle>{t("settings.setup_two_factor_auth")}</ModalTitle>
        <ModalDescription>
          {t("settings.scan_qr_code_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        {is_loading ? (
          <div className="flex items-center justify-center py-12">
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin border-edge-secondary"
              style={{ borderTopColor: "var(--color-info)" }}
            />
          </div>
        ) : error && !setup_data ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <ExclamationTriangleIcon className="w-12 h-12 text-red-500" />
            <p className="text-sm text-center text-red-500">{error}</p>
            <Button variant="secondary" onClick={initiate_setup}>
              {t("settings.try_again")}
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
              <p className="text-xs mb-2 text-txt-muted">
                {t("settings.cant_scan_enter_manually")}
              </p>
              <div className="flex items-center justify-center gap-2">
                <code className="px-3 py-2 rounded-lg text-sm font-mono break-all bg-surf-secondary text-txt-primary">
                  {setup_data.secret}
                </code>
                <button
                  className="p-2 rounded-[14px] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  type="button"
                  onClick={copy_secret}
                >
                  <ClipboardDocumentIcon className="w-4 h-4 text-txt-muted" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin border-edge-secondary"
              style={{ borderTopColor: "var(--color-info)" }}
            />
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!setup_data}
          variant="depth"
          onClick={() => set_step("verify")}
        >
          {t("common.continue")}
        </Button>
      </ModalFooter>
    </>
  );

  const render_verify_step = () => (
    <>
      <ModalHeader>
        <ModalTitle>{t("common.verify_setup")}</ModalTitle>
        <ModalDescription>{t("settings.verify_2fa_setup")}</ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <Input
            ref={input_ref}
            autoComplete="one-time-code"
            className="text-center text-2xl font-semibold tracking-[0.5em]"
            disabled={is_loading}
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            status={error ? "error" : "default"}
            type="text"
            value={verification_code}
            onChange={(e) => handle_code_change(e.target.value)}
            onKeyDown={handle_key_down}
          />
          {error && <p className="text-sm text-center text-red-500">{error}</p>}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={() => set_step("qr_code")}>
          {t("common.back")}
        </Button>
        <Button
          disabled={verification_code.length !== 6 || is_loading}
          variant="depth"
          onClick={handle_verify}
        >
          {is_loading ? t("common.verifying") : t("common.verify")}
        </Button>
      </ModalFooter>
    </>
  );

  const render_backup_codes_step = () => (
    <>
      <ModalHeader>
        <div className="flex items-center gap-3">
          <ShieldCheckIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
          <ModalTitle>{t("settings.two_factor_auth_enabled")}</ModalTitle>
        </div>
        <ModalDescription>
          {t("settings.save_backup_codes_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div className="p-4 rounded-lg border bg-surf-tertiary border-edge-secondary">
            <div className="grid grid-cols-2 gap-2">
              {backup_codes.map((code, index) => (
                <button
                  key={index}
                  className="px-3 py-2 text-sm font-mono text-center rounded cursor-pointer transition-colors hover:opacity-80 bg-surf-secondary text-txt-primary"
                  type="button"
                  onClick={() => copy_single_code(code)}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={copy_backup_codes}>
              <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
              {t("settings.copy_all_codes")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const content = backup_codes.join("\n");
                const blob = new Blob([content], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");

                a.href = url;
                a.download = "aster-backup-codes.txt";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
              {t("common.download")}
            </Button>
          </div>
          <div
            className="flex items-center gap-2 p-3 rounded-lg"
            style={{
              backgroundColor: "#2563eb",
              color: "#fff",
            }}
          >
            <ExclamationTriangleIcon
              className="w-5 h-5 flex-shrink-0"
              style={{ color: "#fff" }}
            />
            <p className="text-xs" style={{ color: "#fff" }}>
              {t("settings.backup_code_security_note")}
            </p>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="depth" onClick={handle_done}>
          {t("common.done")}
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
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
        >
          {step === "qr_code" && render_qr_step()}
          {step === "verify" && render_verify_step()}
          {step === "backup_codes" && render_backup_codes_step()}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
