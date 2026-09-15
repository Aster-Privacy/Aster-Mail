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

import {
  KeyIcon,
  ClipboardIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { InfoPopover } from "@/components/ui/info_popover";
import { use_i18n } from "@/lib/i18n/context";
import { clamp_password } from "@/services/sanitize";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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

  return (
    <>
      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <KeyIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.encryption_keys")}
          </h3>
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
                    {t("settings.your_encryption_key")}
                  </p>
                  <p className="text-xs mt-0.5 text-txt-muted">
                    {pgp_key.algorithm.toUpperCase()}-{pgp_key.key_size}{" "}
                    &middot;{" "}
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
                <code className="flex-1 px-3 py-2 rounded-md text-[11px] font-mono tracking-wide bg-surf-secondary text-txt-secondary border border-edge-primary">
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
                aria-label={t("settings.copy_public_key")}
                size="icon"
                title={t("settings.copy_public_key")}
                variant="ghost"
                onClick={handle_copy_public_key}
              >
                <ClipboardIcon className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ) : pgp_key_load_failed ? (
          <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
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
                  maxLength={128}
                  placeholder={t("common.enter_password_prompt")}
                  type="password"
                  value={export_password}
                  onChange={(e) =>
                    set_export_password(clamp_password(e.target.value))
                  }
                  onKeyDown={(e) =>
                    e["key"] === "Enter" &&
                    !is_exporting_private_key &&
                    export_password.trim() &&
                    (!export_totp_required || export_totp_code.length === 6) &&
                    handle_export_secret_key()
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
                      e["key"] === "Enter" &&
                      !is_exporting_private_key &&
                      export_password.trim() &&
                      export_totp_code.length === 6 &&
                      handle_export_secret_key()
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
    </>
  );
}
