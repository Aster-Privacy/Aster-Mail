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
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@aster/ui";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

import { show_toast } from "@/components/toast/simple_toast";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { ButtonSpinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { BillingSegmented } from "@/components/settings/billing/billing_segmented";
import { clamp_password } from "@/services/sanitize";
import { is_valid_recovery_code } from "@/services/crypto/recovery_key";
import { KEY_FILE_MAX_BYTES } from "@/services/crypto/restore_inactive_keys";
import {
  recover_locked_data,
  recover_locked_data_with_code,
  recover_locked_data_with_key_file,
} from "@/services/locked_data";
import { apply_input_transform } from "@/utils/input_transform";
import { is_composing } from "@/utils/ime";

type RecoverMethod = "code" | "password" | "key_file";

const RECOVERY_CODE_MAX_LENGTH = 32;
const FIELD_CLASS =
  "w-full px-3 py-2.5 rounded-xl text-sm text-txt-primary bg-surf-secondary border border-edge-secondary focus:border-brand focus:outline-none transition-colors";

interface RecoverDataModalProps {
  account_id: string;
  is_open: boolean;
  on_close: () => void;
}

export function RecoverDataModal({
  account_id,
  is_open,
  on_close,
}: RecoverDataModalProps) {
  const { t } = use_i18n();
  const [method, set_method] = useState<RecoverMethod>("code");
  const [code, set_code] = useState("");
  const [password, set_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [key_file, set_key_file] = useState<File | null>(null);
  const [recovering, set_recovering] = useState(false);
  const field_ref = useRef<HTMLInputElement>(null);
  const file_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!is_open) return;

    const timer = setTimeout(() => field_ref.current?.focus(), 150);

    return () => clearTimeout(timer);
  }, [is_open, method]);

  const reset_fields = useCallback(() => {
    set_method("code");
    set_code("");
    set_password("");
    set_show_password(false);
    set_key_file(null);
  }, []);

  const close = useCallback(() => {
    if (recovering) return;
    reset_fields();
    on_close();
  }, [recovering, reset_fields, on_close]);

  const handle_recover_with_code = useCallback(async () => {
    const entered_code = code.toUpperCase().trim();

    if (recovering || !entered_code) return;

    if (!is_valid_recovery_code(entered_code)) {
      show_toast(t("auth.recovery_codes_start_with_aster"), "error");

      return;
    }

    set_recovering(true);

    const result = await recover_locked_data_with_code(
      account_id,
      entered_code,
    );

    set_recovering(false);

    if (result.rate_limited) {
      show_toast(t("common.recover_data_rate_limited"), "error");

      return;
    }

    if (result.restored_key_sets > 0 && result.incomplete) {
      show_toast(t("common.recover_data_partial"), "success");
      set_code("");
      set_method("password");

      return;
    }

    if (result.restored_key_sets > 0) {
      show_toast(t("common.recover_data_success"), "success");
      reset_fields();
      on_close();

      return;
    }

    show_toast(
      t(
        result.failed
          ? "common.recover_data_failed"
          : "common.recover_data_code_no_match",
      ),
      "error",
    );
  }, [recovering, code, account_id, t, reset_fields, on_close]);

  const handle_recover_with_password = useCallback(async () => {
    if (recovering || !password) return;

    set_recovering(true);

    const result = await recover_locked_data(account_id, password);

    set_recovering(false);

    if (result.restored_key_sets > 0 || result.recovered_sent_mail > 0) {
      show_toast(t("common.recover_data_success"), "success");
      reset_fields();
      on_close();

      return;
    }

    show_toast(
      t(
        result.failed
          ? "common.recover_data_failed"
          : result.wrong_password
            ? "common.incorrect_password"
            : "common.recover_data_no_match",
      ),
      "error",
    );
  }, [recovering, password, account_id, t, reset_fields, on_close]);

  const handle_recover_with_key_file = useCallback(async () => {
    if (recovering || !key_file) return;

    if (key_file.size > KEY_FILE_MAX_BYTES) {
      show_toast(t("common.recover_data_key_file_invalid"), "error");

      return;
    }

    set_recovering(true);

    let key_file_text = "";

    try {
      key_file_text = await key_file.text();
    } catch {
      key_file_text = "";
    }

    const result = await recover_locked_data_with_key_file(
      key_file_text,
      password,
    );

    set_recovering(false);

    if (result.status === "imported") {
      show_toast(
        t(
          result.unlocked
            ? "common.recover_data_key_file_success"
            : "common.recover_data_key_file_success_locked",
        ),
        "success",
      );
      reset_fields();
      on_close();

      return;
    }

    if (result.status === "already_present") {
      show_toast(t("common.recover_data_key_file_already"), "success");

      return;
    }

    show_toast(
      t(
        result.status === "invalid"
          ? "common.recover_data_key_file_invalid"
          : result.status === "wrong_password"
            ? "common.recover_data_key_file_wrong_password"
            : "common.recover_data_failed",
      ),
      "error",
    );
  }, [recovering, key_file, password, t, reset_fields, on_close]);

  const handle_recover =
    method === "code"
      ? handle_recover_with_code
      : method === "password"
        ? handle_recover_with_password
        : handle_recover_with_key_file;
  const is_ready =
    method === "code"
      ? !!code.trim()
      : method === "password"
        ? !!password
        : !!key_file;

  const render_password_field = (field_id: string, label: string) => (
    <div className="mt-4 flex flex-col gap-1.5">
      <label
        className="text-xs font-medium text-txt-secondary"
        htmlFor={field_id}
      >
        {label}
      </label>
      <div className="relative">
        <input
          ref={method === "password" ? field_ref : undefined}
          autoComplete="off"
          className={`${FIELD_CLASS} pe-10`}
          data-form-type="other"
          disabled={recovering}
          id={field_id}
          maxLength={128}
          type={show_password ? "text" : "password"}
          value={password}
          onChange={(e) => set_password(clamp_password(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !is_composing(e)) handle_recover();
          }}
        />
        <button
          aria-label={t(
            show_password
              ? "settings.hide_password_toggle"
              : "settings.show_password_toggle",
          )}
          className="absolute end-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary transition-colors"
          tabIndex={-1}
          type="button"
          onClick={() => set_show_password((v) => !v)}
        >
          {show_password ? (
            <EyeSlashIcon className="h-4 w-4" />
          ) : (
            <EyeIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <Modal is_open={is_open} on_close={close} size="sm">
      <ModalHeader>
        <ModalTitle>{t("common.recover_data_title")}</ModalTitle>
        <ModalDescription>
          {t(
            method === "code"
              ? "common.recover_data_code_description"
              : method === "password"
                ? "common.recover_data_description"
                : "common.recover_data_key_file_description",
          )}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <BillingSegmented
          aria_label={t("common.recover_data_title")}
          on_change={(next) => {
            if (recovering) return;
            set_password("");
            set_show_password(false);
            set_method(next);
          }}
          options={[
            { id: "code", label: t("auth.recovery_code_label") },
            { id: "password", label: t("settings.previous_password") },
            { id: "key_file", label: t("common.recover_data_key_file_label") },
          ]}
          value={method}
        />
        {method === "code" ? (
          <div className="mt-4 flex flex-col gap-1.5">
            <label
              className="text-xs font-medium text-txt-secondary"
              htmlFor="recover_data_code"
            >
              {t("auth.recovery_code_label")}
            </label>
            <input
              ref={field_ref}
              autoComplete="off"
              className={`${FIELD_CLASS} font-mono tracking-wider`}
              data-form-type="other"
              disabled={recovering}
              id="recover_data_code"
              maxLength={RECOVERY_CODE_MAX_LENGTH}
              placeholder="ASTER-XXXX-XXXX-XXXX-XXXX"
              type="text"
              value={code}
              onChange={(e) =>
                set_code(
                  apply_input_transform(e.target, (value) =>
                    value.toUpperCase(),
                  ),
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !is_composing(e)) handle_recover();
              }}
            />
          </div>
        ) : method === "password" ? (
          render_password_field(
            "recover_data_password",
            t("settings.previous_password"),
          )
        ) : (
          <>
            <div className="mt-4 flex items-center gap-3">
              <input
                ref={file_ref}
                accept=".asc,.txt,.key,.pgp,application/pgp-keys,text/plain"
                className="hidden"
                disabled={recovering}
                id="recover_data_key_file"
                type="file"
                onChange={(e) => {
                  set_key_file(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <Button
                disabled={recovering}
                variant="outline"
                onClick={() => file_ref.current?.click()}
              >
                {t("common.recover_data_choose_file")}
              </Button>
              {key_file && (
                <span className="min-w-0 truncate text-sm text-txt-secondary">
                  {key_file.name}
                </span>
              )}
            </div>
            {render_password_field(
              "recover_data_key_file_password",
              t("common.recover_data_key_file_password"),
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button disabled={recovering} variant="outline" onClick={close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={recovering || !is_ready}
          variant="depth"
          onClick={handle_recover}
        >
          {t("common.recover_data_button")}
          {recovering && <ButtonSpinner />}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
