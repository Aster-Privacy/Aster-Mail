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
import type { KeyboardEvent } from "react";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExclamationTriangleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { MobileBottomSheet } from "@/components/mobile/mobile_bottom_sheet";
import { Input } from "@/components/ui/input";
import { use_folders } from "@/hooks/use_folders";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { api_client } from "@/services/api/client";
import { get_cancel_password_hash } from "@/components/settings/billing/cancel_password";

const TRANSPORT_FAILURE_CODES = new Set([
  "NETWORK_ERROR",
  "TIMEOUT_ERROR",
  "SERVER_ERROR",
]);

function is_transport_failure(code?: string): boolean {
  return code !== undefined && TRANSPORT_FAILURE_CODES.has(code);
}

export type FolderDeleteDialogVariant = "modal" | "sheet";

interface FolderDeleteDialogProps {
  is_open: boolean;
  on_close: () => void;
  on_deleted?: () => void;
  folder_id: string;
  folder_name: string;
  has_children?: boolean;
  variant?: FolderDeleteDialogVariant;
}

export function FolderDeleteDialog({
  is_open,
  on_close,
  on_deleted,
  folder_id,
  folder_name,
  has_children,
  variant = "modal",
}: FolderDeleteDialogProps) {
  const { t } = use_i18n();
  const { delete_existing_folder, state: folders_state } = use_folders();
  const { preferences } = use_preferences();

  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const [step_up_required, set_step_up_required] = useState(false);
  const [account_password, set_account_password] = useState("");
  const [totp_code, set_totp_code] = useState("");
  const [totp_required, set_totp_required] = useState(false);
  const [totp_state_failed, set_totp_state_failed] = useState(false);
  const [totp_state_attempt, set_totp_state_attempt] = useState(0);
  const [purge_contents, set_purge_contents] = useState(false);
  const [purge_acknowledged, set_purge_acknowledged] = useState(false);
  const [delete_outcome, set_delete_outcome] = useState<{
    purged_items: number;
  } | null>(null);

  const opened_key_ref = useRef<string | null>(null);
  const folders = folders_state.folders;
  const purge_by_default = preferences.purge_locked_folder_on_delete === true;

  const folder_record = folders.find((f) => f.id === folder_id);
  const is_password_protected = Boolean(
    folder_record?.is_password_protected && folder_record?.password_set,
  );

  useEffect(() => {
    const open_key = is_open ? folder_id : null;

    if (opened_key_ref.current === open_key) return;

    opened_key_ref.current = open_key;

    if (!is_open) return;

    set_step_up_required(is_password_protected);
    set_is_loading(false);
    set_error("");
    set_account_password("");
    set_totp_code("");
    set_totp_required(false);
    set_totp_state_failed(false);
    set_totp_state_attempt(0);
    set_purge_acknowledged(false);
    set_delete_outcome(null);
    set_purge_contents(is_password_protected && purge_by_default);
  }, [is_open, folder_id, is_password_protected, purge_by_default]);

  useEffect(() => {
    if (!is_open || is_loading || delete_outcome) return;
    if (!folder_record) return;

    set_step_up_required(is_password_protected);
  }, [
    is_open,
    is_loading,
    delete_outcome,
    folder_record,
    is_password_protected,
  ]);

  useEffect(() => {
    if (!is_open || !step_up_required) return;

    let cancelled = false;

    const load_totp_state = async () => {
      const response = await api_client.get<{
        salt: string;
        totp_required?: boolean;
      }>("/crypto/v1/encryption/salt", { skip_cache: true });

      if (cancelled) return;

      if (!response.data) {
        set_totp_state_failed(true);
        set_error(t("common.something_went_wrong_try_again"));

        return;
      }

      set_totp_state_failed(false);
      set_totp_required(response.data.totp_required === true);
    };

    void load_totp_state();

    return () => {
      cancelled = true;
    };
  }, [is_open, step_up_required, totp_state_attempt, t]);

  const handle_delete = useCallback(async () => {
    if (step_up_required && !account_password.trim()) {
      set_error(t("common.delete_folder_password_required"));

      return;
    }

    if (step_up_required && totp_required && !totp_code.trim()) {
      set_error(t("common.delete_folder_totp_required"));

      return;
    }

    set_is_loading(true);
    set_error("");

    let password_hash: string | null = null;

    if (step_up_required) {
      password_hash = await get_cancel_password_hash(account_password);

      if (!password_hash) {
        set_is_loading(false);
        set_error(t("common.delete_folder_verification_failed"));

        return;
      }
    }

    const outcome = await delete_existing_folder(
      folder_id,
      step_up_required
        ? {
            password_hash: password_hash ?? undefined,
            ...(totp_required ? { totp_code: totp_code.trim() } : {}),
            purge_contents: purge_contents && purge_acknowledged,
          }
        : undefined,
    );

    set_is_loading(false);

    if (!outcome.success) {
      if (is_transport_failure(outcome.code)) {
        set_error(t("common.something_went_wrong_try_again"));

        return;
      }

      set_error(
        step_up_required
          ? t("common.delete_folder_verification_failed")
          : t("common.failed_to_delete_folder"),
      );

      return;
    }

    on_deleted?.();

    if (step_up_required) {
      set_delete_outcome({ purged_items: outcome.purged_items ?? 0 });

      return;
    }

    on_close();
  }, [
    step_up_required,
    account_password,
    totp_required,
    totp_code,
    purge_contents,
    purge_acknowledged,
    folder_id,
    delete_existing_folder,
    on_deleted,
    on_close,
    t,
  ]);

  const is_sheet = variant === "sheet";

  const confirm_disabled =
    is_loading ||
    (step_up_required && totp_state_failed) ||
    (step_up_required &&
      (!account_password.trim() ||
        (totp_required && !totp_code.trim()) ||
        (purge_contents && !purge_acknowledged)));

  const handle_step_up_key_down = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (confirm_disabled) return;
    void handle_delete();
  };

  const checkbox_class = is_sheet ? "mt-0.5 h-5 w-5 shrink-0" : "mt-0.5";
  const option_row_class = is_sheet
    ? "flex min-h-[44px] items-start gap-3 py-2 text-[14px] text-txt-secondary"
    : "flex items-start gap-2 text-[13px] text-txt-secondary";

  const outcome_text = delete_outcome
    ? delete_outcome.purged_items > 0
      ? t("common.delete_folder_purged_items", {
          count: delete_outcome.purged_items,
        })
      : t("common.delete_folder_deleted_no_purge")
    : "";

  const confirm_body = (
    <>
      <div className="rounded-lg p-4 mb-4 bg-red-600 dark:bg-red-700">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-white mb-1">
              {t("common.action_cannot_be_undone")}
            </p>
            <p className="text-[12px] text-red-100">
              {t("common.delete_folder_warning")}
              {has_children && t("common.delete_folder_subfolders")}
            </p>
          </div>
        </div>
      </div>

      <p className="text-[14px] text-txt-secondary">
        {t("common.delete_folder_confirm")}{" "}
        <strong>&quot;{folder_name}&quot;</strong>?
      </p>

      {step_up_required && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[13px] text-txt-secondary">
            {t("common.delete_folder_step_up_hint")}
          </p>

          {totp_state_failed && (
            <button
              className="self-start text-[13px] font-medium text-accent-blue hover:underline"
              type="button"
              onClick={() => {
                set_error("");
                set_totp_state_attempt((prev) => prev + 1);
              }}
            >
              {t("common.retry")}
            </button>
          )}

          <div>
            <label
              className="block text-[13px] font-medium mb-2 text-txt-secondary"
              htmlFor={`folder-delete-password-${variant}`}
            >
              {t("common.delete_folder_account_password")}
            </label>
            <Input
              autoComplete="current-password"
              className="w-full"
              id={`folder-delete-password-${variant}`}
              type="password"
              value={account_password}
              onChange={(e) => set_account_password(e.target.value)}
              onKeyDown={handle_step_up_key_down}
            />
          </div>

          {totp_required && (
            <div>
              <label
                className="block text-[13px] font-medium mb-2 text-txt-secondary"
                htmlFor={`folder-delete-totp-${variant}`}
              >
                {t("common.delete_folder_totp_code")}
              </label>
              <Input
                autoComplete="one-time-code"
                className="w-full"
                id={`folder-delete-totp-${variant}`}
                inputMode="numeric"
                type="text"
                value={totp_code}
                onChange={(e) => set_totp_code(e.target.value)}
                onKeyDown={handle_step_up_key_down}
              />
            </div>
          )}

          <label
            className={option_row_class}
            htmlFor={`folder-delete-purge-${variant}`}
          >
            <input
              checked={purge_contents}
              className={checkbox_class}
              id={`folder-delete-purge-${variant}`}
              type="checkbox"
              onChange={(e) => {
                set_purge_contents(e.target.checked);
                if (!e.target.checked) set_purge_acknowledged(false);
              }}
            />
            <span>{t("common.delete_folder_purge_option")}</span>
          </label>

          {purge_contents && (
            <div className="rounded-lg p-3 bg-red-600 dark:bg-red-700">
              <p className="text-[12px] text-white mb-2">
                {t("common.delete_folder_purge_warning")}
              </p>
              <label
                className={
                  is_sheet
                    ? "flex min-h-[44px] items-start gap-3 py-1 text-[13px] text-white"
                    : "flex items-start gap-2 text-[12px] text-white"
                }
                htmlFor={`folder-delete-purge-ack-${variant}`}
              >
                <input
                  checked={purge_acknowledged}
                  className={checkbox_class}
                  id={`folder-delete-purge-ack-${variant}`}
                  type="checkbox"
                  onChange={(e) => set_purge_acknowledged(e.target.checked)}
                />
                <span>{t("common.delete_folder_purge_acknowledge")}</span>
              </label>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-[13px] text-red-500 mt-4">{error}</p>}
    </>
  );

  if (is_sheet) {
    return (
      <MobileBottomSheet
        aria_label={t("common.delete_folder")}
        is_open={is_open}
        on_close={on_close}
      >
        <div className="overflow-y-auto px-4 pb-4">
          <p className="text-[16px] font-semibold text-[var(--text-primary)]">
            {t("common.delete_folder")}
          </p>
          <p className="mb-4 truncate text-[13px] text-[var(--text-muted)]">
            {folder_name}
          </p>

          {delete_outcome ? (
            <>
              <p className="text-[14px] text-txt-secondary">{outcome_text}</p>
              <Button
                className="mt-4 w-full rounded-[16px] py-3 text-[15px] font-medium"
                type="button"
                variant="depth"
                onClick={on_close}
              >
                {t("common.done")}
              </Button>
            </>
          ) : (
            <>
              {confirm_body}
              <div className="mt-4 flex gap-2">
                <Button
                  className="flex-1 rounded-[16px] py-3 text-[15px] font-medium"
                  disabled={is_loading}
                  type="button"
                  variant="outline"
                  onClick={on_close}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  className="flex-1 rounded-[16px] py-3 text-[15px] font-medium"
                  disabled={confirm_disabled}
                  type="button"
                  variant="destructive"
                  onClick={handle_delete}
                >
                  {is_loading ? t("common.deleting") : t("common.delete")}
                </Button>
              </div>
            </>
          )}
        </div>
      </MobileBottomSheet>
    );
  }

  return (
    <Modal is_open={is_open} on_close={on_close} size="md">
      <ModalHeader>
        <div className="flex items-center gap-3">
          <TrashIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="min-w-0">
            <ModalTitle>{t("common.delete_folder")}</ModalTitle>
            <ModalDescription>{folder_name}</ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        {delete_outcome ? (
          <p className="text-[14px] text-txt-secondary">{outcome_text}</p>
        ) : (
          confirm_body
        )}
      </ModalBody>

      <ModalFooter>
        {delete_outcome ? (
          <Button
            className="flex-1"
            size="xl"
            variant="depth"
            onClick={on_close}
          >
            {t("common.done")}
          </Button>
        ) : (
          <>
            <Button
              className="flex-1"
              disabled={is_loading}
              size="xl"
              variant="outline"
              onClick={on_close}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="flex-1"
              disabled={confirm_disabled}
              size="xl"
              variant="destructive"
              onClick={handle_delete}
            >
              {is_loading
                ? t("common.deleting")
                : `${t("common.delete")} ${t("mail.folder")}`}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
