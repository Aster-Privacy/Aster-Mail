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
import type {
  PgpKeyInfo,
  RecoveryCodesInfo,
} from "@/components/settings/hooks/use_encryption";

import { AnimatePresence, motion } from "framer-motion";
import {
  KeyIcon,
  ClipboardIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { use_should_reduce_motion } from "@/provider";
import { show_toast } from "@/components/toast/simple_toast";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";

interface KeyRotationPanelProps {
  pgp_key: PgpKeyInfo | null;
  recovery_info: RecoveryCodesInfo | null;
  recovery_codes: string[] | null;
  show_recovery_codes: boolean;
  show_export_prompt: boolean;
  show_regenerate_confirm: boolean;
  export_password: string;
  set_export_password: (value: string) => void;
  export_totp_code: string;
  set_export_totp_code: (value: string) => void;
  export_error: string;
  export_totp_required: boolean;
  is_exporting_private_key: boolean;
  regenerate_confirm_text: string;
  set_regenerate_confirm_text: (value: string) => void;
  is_regenerating: boolean;
  regenerate_password: string;
  set_regenerate_password: (value: string) => void;
  regenerate_totp_code: string;
  set_regenerate_totp_code: (value: string) => void;
  regenerate_totp_required: boolean;
  regenerate_error: string;
  codes_key: number;
  codes_remaining: number;
  codes_total: number;
  codes_used: number;
  format_fingerprint: (fp: string) => string;
  format_date: (date_string: string) => string;
  handle_copy_fingerprint: () => Promise<void>;
  handle_export_public_key: () => Promise<void>;
  handle_export_secret_key: () => Promise<void>;
  handle_copy_public_key: () => Promise<void>;
  handle_download_codes: () => void;
  handle_copy_all_codes: () => Promise<void>;
  handle_regenerate_codes: () => Promise<void>;
  close_export_prompt: () => void;
  open_export_prompt: () => void;
  close_regenerate_confirm: () => void;
  open_regenerate_confirm: () => void;
}

export function KeyRotationPanel({
  pgp_key,
  recovery_codes,
  show_recovery_codes,
  show_export_prompt,
  show_regenerate_confirm,
  export_password,
  set_export_password,
  export_totp_code,
  set_export_totp_code,
  export_error,
  export_totp_required,
  is_exporting_private_key,
  regenerate_confirm_text,
  set_regenerate_confirm_text,
  is_regenerating,
  regenerate_password,
  set_regenerate_password,
  regenerate_totp_code,
  set_regenerate_totp_code,
  regenerate_totp_required,
  regenerate_error,
  codes_key,
  codes_remaining,
  codes_total,
  codes_used,
  format_fingerprint,
  format_date,
  handle_copy_fingerprint,
  handle_export_public_key,
  handle_export_secret_key,
  handle_copy_public_key,
  handle_download_codes,
  handle_copy_all_codes,
  handle_regenerate_codes,
  close_export_prompt,
  open_export_prompt,
  close_regenerate_confirm,
  open_regenerate_confirm,
}: KeyRotationPanelProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  return (
    <>
      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <KeyIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.encryption_keys")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("settings.encryption_keys_description")}
        </p>

        {pgp_key ? (
          <div className="rounded-lg bg-surf-tertiary border border-edge-secondary">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-txt-primary">
                    {pgp_key.algorithm.toUpperCase()}-{pgp_key.key_size}
                  </p>
                  <p className="text-xs mt-0.5 text-txt-muted">
                    {t("settings.created_date", {
                      date: format_date(pgp_key.created_at),
                    })}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-500/10 text-green-500">
                  <CheckCircleIcon className="w-3.5 h-3.5" />
                  {t("common.active")}
                </span>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-edge-secondary">
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-md text-[11px] font-mono tracking-wide bg-surf-secondary text-txt-secondary border border-edge-primary">
                  {format_fingerprint(pgp_key.fingerprint)}
                </code>
                <Button
                  size="icon"
                  title={t("common.copy")}
                  variant="ghost"
                  onClick={handle_copy_fingerprint}
                >
                  <ClipboardIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="px-4 py-3 flex gap-2 border-t border-edge-secondary">
              <Button
                className="flex-1"
                size="md"
                variant="depth"
                onClick={handle_export_public_key}
              >
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                {t("settings.export_public_key_label")}
              </Button>
              <Button
                className="flex-1"
                size="md"
                variant="depth"
                onClick={open_export_prompt}
              >
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                {t("settings.export_private_key_label")}
              </Button>
              <Button
                size="icon"
                title={t("common.copy")}
                variant="ghost"
                onClick={handle_copy_public_key}
              >
                <ClipboardIcon className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
            <KeyIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
            <p className="text-sm text-txt-muted">
              {t("settings.no_encryption_key")}
            </p>
          </div>
        )}

        <Modal
          is_open={show_export_prompt}
          on_close={close_export_prompt}
          size="md"
        >
          <ModalHeader>
            <ModalTitle>{t("common.export_private_key")}</ModalTitle>
            <ModalDescription>
              {t("settings.verify_identity_export")}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                  {t("settings.password")}
                </label>
                <Input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  placeholder={t("common.enter_password_prompt")}
                  type="password"
                  value={export_password}
                  onChange={(e) => set_export_password(e.target.value)}
                  onKeyDown={(e) =>
                    e["key"] === "Enter" && handle_export_secret_key()
                  }
                />
              </div>
              {export_totp_required && (
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                    {t("settings.two_fa_code_label")}
                  </label>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={t("common.two_fa_code_placeholder")}
                    type="text"
                    value={export_totp_code}
                    onChange={(e) =>
                      set_export_totp_code(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    onKeyDown={(e) =>
                      e["key"] === "Enter" && handle_export_secret_key()
                    }
                  />
                </div>
              )}
              {export_error && (
                <p className="text-xs text-red-500">{export_error}</p>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={close_export_prompt}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={
                is_exporting_private_key ||
                !export_password.trim() ||
                (export_totp_required && export_totp_code.length !== 6)
              }
              variant="depth"
              onClick={handle_export_secret_key}
            >
              {is_exporting_private_key ? (
                <Spinner size="md" />
              ) : (
                t("common.export")
              )}
            </Button>
          </ModalFooter>
        </Modal>
      </div>

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <ShieldCheckIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.recovery_codes")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("settings.codes_remaining_count", {
            remaining: codes_remaining,
            total: codes_total,
          })}
        </p>

        <div className="rounded-lg bg-surf-tertiary border border-edge-secondary">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-txt-primary">
                {t("settings.recovery_codes")}
              </span>
              {codes_used > 0 && (
                <span
                  className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor:
                      codes_remaining <= 2 ? "#dc2626" : "#d97706",
                    color: "#fff",
                  }}
                >
                  {t("settings.codes_used_count", { used: codes_used })}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {Array.from({ length: codes_total }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 h-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      i < codes_remaining
                        ? "var(--accent-color)"
                        : "var(--border-secondary)",
                  }}
                />
              ))}
            </div>
          </div>

          {codes_remaining <= 2 && codes_remaining > 0 && (
            <div className="px-4 py-2.5 flex items-center gap-2 border-t border-edge-secondary bg-red-500/5">
              <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-500">
                {t("settings.running_low_warning")}
              </p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {show_recovery_codes && recovery_codes && (
              <motion.div
                key={codes_key}
                animate={{ opacity: 1 }}
                className="px-4 py-3 border-t border-edge-secondary"
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
                transition={{ duration: reduce_motion ? 0 : 0.2 }}
              >
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {recovery_codes.map((code, index) => (
                    <button
                      key={`${codes_key}-${index}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-[14px] cursor-pointer transition-colors bg-surf-secondary border border-edge-primary hover:bg-surf-hover"
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(code);
                          show_toast(
                            t("settings.copied_to_clipboard"),
                            "success",
                          );
                        } catch (error) {
                          if (import.meta.env.DEV) console.error(error);

                          return;
                        }
                      }}
                    >
                      <span className="text-[10px] font-medium w-4 text-txt-muted">
                        {index + 1}
                      </span>
                      <code className="text-xs font-mono text-txt-primary">
                        {code}
                      </code>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    size="md"
                    variant="outline"
                    onClick={handle_download_codes}
                  >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    {t("settings.download_pdf")}
                  </Button>
                  <Button
                    size="icon"
                    title={t("common.copy")}
                    variant="ghost"
                    onClick={handle_copy_all_codes}
                  >
                    <ClipboardIcon className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="px-4 py-3 border-t border-edge-secondary">
            <Button
              className="w-full"
              size="md"
              variant="depth"
              onClick={open_regenerate_confirm}
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
              {t("settings.regenerate_codes_label")}
            </Button>
          </div>
        </div>

        <Modal
          is_open={show_regenerate_confirm}
          on_close={close_regenerate_confirm}
          size="md"
        >
          <ModalHeader>
            <ModalTitle>{t("common.regenerate_recovery_codes")}</ModalTitle>
            <ModalDescription>
              {t("settings.regenerate_codes_warning")}{" "}
              <code className="px-1 py-0.5 rounded text-[10px] bg-surf-secondary">
                regenerate
              </code>{" "}
              {t("common.confirm").toLowerCase()}.
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-3">
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                placeholder={t("settings.type_regenerate")}
                type="text"
                value={regenerate_confirm_text}
                onChange={(e) => set_regenerate_confirm_text(e.target.value)}
              />
              <div>
                <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                  {t("settings.password")}
                </label>
                <Input
                  placeholder={t("common.enter_password_prompt")}
                  type="password"
                  value={regenerate_password}
                  onChange={(e) => set_regenerate_password(e.target.value)}
                  onKeyDown={(e) =>
                    e["key"] === "Enter" &&
                    regenerate_confirm_text.toLowerCase() === "regenerate" &&
                    regenerate_password.trim() &&
                    handle_regenerate_codes()
                  }
                />
              </div>
              {regenerate_totp_required && (
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                    {t("settings.two_fa_code_label")}
                  </label>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={t("common.two_fa_code_placeholder")}
                    type="text"
                    value={regenerate_totp_code}
                    onChange={(e) =>
                      set_regenerate_totp_code(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    onKeyDown={(e) =>
                      e["key"] === "Enter" &&
                      regenerate_confirm_text.toLowerCase() === "regenerate" &&
                      regenerate_password.trim() &&
                      handle_regenerate_codes()
                    }
                  />
                </div>
              )}
              {regenerate_error && (
                <p className="text-xs text-red-500">{regenerate_error}</p>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={close_regenerate_confirm}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={
                regenerate_confirm_text.toLowerCase() !== "regenerate" ||
                !regenerate_password.trim() ||
                (regenerate_totp_required &&
                  regenerate_totp_code.length !== 6) ||
                is_regenerating
              }
              variant="destructive"
              onClick={handle_regenerate_codes}
            >
              {is_regenerating ? <Spinner size="md" /> : t("common.regenerate")}
            </Button>
          </ModalFooter>
        </Modal>
      </div>
    </>
  );
}
