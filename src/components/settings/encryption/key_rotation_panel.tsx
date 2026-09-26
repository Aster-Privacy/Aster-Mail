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
import type { PgpKeyInfo } from "@/components/settings/hooks/use_encryption";

import { useEffect, useState, type KeyboardEvent } from "react";
import {
  KeyIcon,
  ClipboardIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Island,
  IslandDivider,
  IslandRow,
  IslandSection,
} from "@aster/ui";

import { InfoPopover } from "@/components/ui/info_popover";
import { use_i18n } from "@/lib/i18n/context";
import { clamp_password } from "@/services/sanitize";
import { Input } from "@/components/ui/input";
import { ButtonSpinner } from "@/components/ui/spinner";
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
  pgp_key_load_failed: boolean;
  retry_load_encryption_data: () => Promise<void>;
  show_export_prompt: boolean;
  export_password: string;
  set_export_password: (value: string) => void;
  export_totp_code: string;
  set_export_totp_code: (value: string) => void;
  export_error: string;
  export_totp_required: boolean;
  is_exporting_private_key: boolean;
  format_fingerprint: (fp: string) => string;
  format_date: (date_string: string) => string;
  handle_copy_fingerprint: () => Promise<void>;
  handle_export_public_key: () => Promise<void>;
  handle_export_secret_key: () => Promise<void>;
  handle_copy_public_key: () => Promise<void>;
  close_export_prompt: () => void;
  open_export_prompt: () => void;
}

export function KeyRotationPanel({
  pgp_key,
  pgp_key_load_failed,
  retry_load_encryption_data,
  show_export_prompt,
  export_password,
  set_export_password,
  export_totp_code,
  set_export_totp_code,
  export_error,
  export_totp_required,
  is_exporting_private_key,
  format_fingerprint,
  format_date,
  handle_copy_fingerprint,
  handle_export_public_key,
  handle_export_secret_key,
  handle_copy_public_key,
  close_export_prompt,
  open_export_prompt,
}: KeyRotationPanelProps) {
  const { t } = use_i18n();
  const [show_password, set_show_password] = useState(false);

  useEffect(() => {
    if (!show_export_prompt) set_show_password(false);
  }, [show_export_prompt]);

  const can_submit =
    !is_exporting_private_key &&
    export_password.trim().length > 0 &&
    (!export_totp_required || export_totp_code.length === 6);

  const submit_on_enter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && can_submit) void handle_export_secret_key();
  };

  return (
    <>
      <IslandSection
        bare
        description={t("settings.encryption_keys_description")}
        icon={<KeyIcon />}
        title={t("settings.encryption_keys")}
      >
        {pgp_key ? (
          <Island>
            <IslandRow
              description={
                <>
                  {pgp_key.algorithm.toUpperCase()}-{pgp_key.key_size} &middot;{" "}
                  {t("settings.created_date", {
                    date: format_date(pgp_key.created_at),
                  })}
                </>
              }
              label={t("settings.your_encryption_key")}
              trailing={
                <span
                  className="inline-flex items-center gap-1 text-[12px] font-semibold"
                  style={{ color: "var(--color-success)" }}
                >
                  <CheckCircleIcon
                    aria-hidden="true"
                    className="h-[15px] w-[15px]"
                  />
                  {t("common.active")}
                </span>
              }
            />

            <IslandDivider />

            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <p className="text-xs font-medium text-txt-secondary">
                  {t("settings.key_fingerprint")}
                </p>
                <InfoPopover
                  description={t("settings.info_fingerprint_description")}
                  title={t("settings.info_fingerprint_title")}
                />
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 break-all rounded-[var(--aster-radius-field,10px)] bg-[var(--aster-field-bg)] px-3 py-2 text-[11px] font-mono tracking-wide text-txt-primary">
                  {format_fingerprint(pgp_key.fingerprint)}
                </code>
                <Button
                  aria-label={t("settings.copy_fingerprint")}
                  size="icon"
                  title={t("settings.copy_fingerprint")}
                  variant="ghost"
                  onClick={handle_copy_fingerprint}
                >
                  <ClipboardIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <IslandDivider />

            <div className="px-4 py-3 flex flex-wrap gap-2">
              <Button
                className="flex-1"
                size="md"
                variant="secondary"
                onClick={handle_export_public_key}
              >
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                {t("settings.export_public_key_label")}
              </Button>
              <Button
                className="flex-1"
                size="md"
                variant="secondary"
                onClick={open_export_prompt}
              >
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                {t("settings.export_private_key_label")}
              </Button>
              <Button
                aria-label={t("settings.copy_public_key")}
                size="icon"
                title={t("settings.copy_public_key")}
                variant="ghost"
                onClick={handle_copy_public_key}
              >
                <ClipboardIcon className="w-3.5 h-3.5" />
              </Button>
            </div>
          </Island>
        ) : pgp_key_load_failed ? (
          <Island className="text-center" padding="lg">
            <ExclamationTriangleIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
            <p className="text-sm text-txt-muted mb-3">
              {t("settings.encryption_key_load_failed")}
            </p>
            <Button
              size="sm"
              variant="depth"
              onClick={retry_load_encryption_data}
            >
              {t("common.retry")}
            </Button>
          </Island>
        ) : (
          <Island className="text-center" padding="lg">
            <KeyIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
            <p className="text-sm text-txt-muted">
              {t("settings.no_encryption_key")}
            </p>
          </Island>
        )}
      </IslandSection>

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
          <div className="space-y-4">
            <Island padding="sm" tone="warning">
              <div className="flex items-start gap-2.5">
                <ExclamationTriangleIcon
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: "var(--color-warning)" }}
                />
                <p className="text-[13px] leading-relaxed text-txt-secondary">
                  {t("settings.export_private_key_warning")}
                </p>
              </div>
            </Island>
            <div>
              <label
                className="block text-xs font-medium mb-1.5 text-txt-secondary"
                htmlFor="export_private_key_password"
              >
                {t("settings.password")}
              </label>
              <div className="relative">
                <Input
                  autoComplete="current-password"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={!export_totp_required}
                  className="pe-10"
                  disabled={is_exporting_private_key}
                  id="export_private_key_password"
                  maxLength={128}
                  placeholder={t("common.enter_password_prompt")}
                  status={
                    export_error && !export_totp_required ? "error" : "default"
                  }
                  type={show_password ? "text" : "password"}
                  value={export_password}
                  onChange={(e) =>
                    set_export_password(clamp_password(e.target.value))
                  }
                  onKeyDown={submit_on_enter}
                />
                <Button
                  aria-label={
                    show_password
                      ? t("settings.hide_password_toggle")
                      : t("settings.show_password_toggle")
                  }
                  className="absolute end-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  disabled={is_exporting_private_key}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => set_show_password((value) => !value)}
                >
                  {show_password ? (
                    <EyeSlashIcon className="w-4 h-4 text-txt-muted" />
                  ) : (
                    <EyeIcon className="w-4 h-4 text-txt-muted" />
                  )}
                </Button>
              </div>
            </div>
            {export_totp_required && (
              <div>
                <label
                  className="block text-xs font-medium mb-1.5 text-txt-secondary"
                  htmlFor="export_private_key_code"
                >
                  {t("settings.two_fa_code_label")}
                </label>
                <Input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  autoComplete="one-time-code"
                  disabled={is_exporting_private_key}
                  id="export_private_key_code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t("common.two_fa_code_placeholder")}
                  status={export_error ? "error" : "default"}
                  type="text"
                  value={export_totp_code}
                  onChange={(e) =>
                    set_export_totp_code(
                      e.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  onKeyDown={submit_on_enter}
                />
                <p className="mt-1.5 text-xs leading-relaxed text-txt-muted">
                  {t("settings.export_two_factor_hint")}
                </p>
              </div>
            )}
            {export_error && (
              <p
                className="flex items-start gap-1.5 text-[13px] leading-snug"
                role="alert"
                style={{ color: "var(--color-danger)" }}
              >
                <ExclamationCircleIcon
                  aria-hidden="true"
                  className="mt-px h-4 w-4 shrink-0"
                />
                <span>{export_error}</span>
              </p>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            disabled={is_exporting_private_key}
            variant="ghost"
            onClick={close_export_prompt}
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!can_submit}
            variant="depth"
            onClick={handle_export_secret_key}
          >
            {t("common.export")}
            {is_exporting_private_key && <ButtonSpinner />}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
