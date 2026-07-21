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
import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
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
  classify_totp_error,
  regenerate_backup_codes,
} from "@/services/api/totp";
import { use_i18n } from "@/lib/i18n/context";

interface RegenerateBackupCodesModalProps {
  is_open: boolean;
  on_close: () => void;
  on_success: () => void;
}

export function RegenerateBackupCodesModal({
  is_open,
  on_close,
  on_success,
}: RegenerateBackupCodesModalProps) {
  const { t } = use_i18n();
  const [code, set_code] = useState("");
  const [backup_codes, set_backup_codes] = useState<string[]>([]);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const input_ref = useRef<HTMLInputElement>(null);
  const verifying_ref = useRef(false);

  useEffect(() => {
    if (is_open) {
      set_code("");
      set_backup_codes([]);
      set_error("");
      set_is_loading(false);
      setTimeout(() => input_ref.current?.focus(), 100);
    }
  }, [is_open]);

  const handle_code_change = (value: string) => {
    set_code(value.replace(/\D/g, "").slice(0, 6));
    if (error) set_error("");
  };

  const handle_regenerate = async () => {
    if (code.length !== 6 || verifying_ref.current) return;

    verifying_ref.current = true;
    set_is_loading(true);
    set_error("");

    const response = await regenerate_backup_codes({ code });

    if (response.error) {
      const kind = classify_totp_error(response);

      set_error(
        kind === "locked"
          ? t("auth.two_fa_temporarily_locked")
          : response.error,
      );
      verifying_ref.current = false;
      set_is_loading(false);
      input_ref.current?.focus();
      input_ref.current?.select();

      return;
    }

    if (response.data) {
      set_backup_codes(response.data.backup_codes);
      on_success();
    }

    verifying_ref.current = false;
    set_is_loading(false);
  };

  const copy_single_code = async (single_code: string) => {
    await navigator.clipboard.writeText(single_code);
    show_toast(t("common.copied_to_clipboard"), "success");
  };

  const copy_backup_codes = async () => {
    await navigator.clipboard.writeText(backup_codes.join("\n"));
    show_toast(t("common.copied_to_clipboard"), "success");
  };

  const handle_modal_close = useCallback(() => {
    if (verifying_ref.current) return;
    on_close();
  }, [on_close]);

  return (
    <Modal
      close_on_overlay={false}
      is_open={is_open}
      on_close={handle_modal_close}
      size="md"
    >
      {backup_codes.length === 0 ? (
        <>
          <ModalHeader>
            <ModalTitle>{t("settings.regenerate_backup_codes")}</ModalTitle>
            <ModalDescription>
              {t("settings.regenerate_backup_codes_description")}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label
                  className="text-sm font-medium block mb-2 text-txt-primary"
                  htmlFor="regen-totp-code"
                >
                  {t("settings.authenticator_code")}
                </label>
                <Input
                  ref={input_ref}
                  autoComplete="one-time-code"
                  className="text-center text-2xl font-semibold tracking-[0.5em]"
                  disabled={is_loading}
                  id="regen-totp-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  status={error ? "error" : "default"}
                  type="text"
                  value={code}
                  onChange={(e) => handle_code_change(e.target.value)}
                  onKeyDown={(e) => e["key"] === "Enter" && handle_regenerate()}
                />
              </div>
              {error && (
                <p className="text-sm text-center text-red-500">{error}</p>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              disabled={is_loading}
              variant="outline"
              onClick={handle_modal_close}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={code.length !== 6 || is_loading}
              variant="depth"
              onClick={handle_regenerate}
            >
              {is_loading
                ? t("common.verifying")
                : t("settings.regenerate_backup_codes")}
            </Button>
          </ModalFooter>
        </>
      ) : (
        <>
          <ModalHeader>
            <div className="flex items-center gap-3">
              <ShieldCheckIcon className="w-6 h-6 text-txt-primary flex-shrink-0" />
              <ModalTitle>{t("settings.backup_codes_regenerated")}</ModalTitle>
            </div>
            <ModalDescription>
              {t("settings.save_backup_codes_description")}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="p-4 rounded-lg border bg-surf-tertiary border-edge-secondary">
                <div className="grid grid-cols-2 gap-2">
                  {backup_codes.map((backup_code, index) => (
                    <button
                      key={index}
                      className="px-3 py-2 text-sm font-mono text-center rounded cursor-pointer transition-colors hover:opacity-80 bg-surf-secondary text-txt-primary"
                      type="button"
                      onClick={() => copy_single_code(backup_code)}
                    >
                      {backup_code}
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
                  backgroundColor: "var(--accent-color-hover)",
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
            <Button variant="depth" onClick={on_close}>
              {t("common.done")}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}
