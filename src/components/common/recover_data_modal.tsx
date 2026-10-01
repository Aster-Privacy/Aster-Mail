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
import {
  recover_locked_data,
  recover_locked_data_with_code,
} from "@/services/locked_data";
import { apply_input_transform } from "@/utils/input_transform";
import { is_composing } from "@/utils/ime";

type RecoverMethod = "code" | "password";

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
  const [recovering, set_recovering] = useState(false);
  const field_ref = useRef<HTMLInputElement>(null);

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
          : "common.recover_data_no_match",
      ),
      "error",
    );
  }, [recovering, password, account_id, t, reset_fields, on_close]);

  const handle_recover =
    method === "code" ? handle_recover_with_code : handle_recover_with_password;
  const is_ready = method === "code" ? !!code.trim() : !!password;

  return (
    <Modal is_open={is_open} on_close={close} size="sm">
      <ModalHeader>
        <ModalTitle>{t("common.recover_data_title")}</ModalTitle>
        <ModalDescription>
          {t(
            method === "code"
              ? "common.recover_data_code_description"
              : "common.recover_data_description",
          )}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <BillingSegmented
          aria_label={t("common.recover_data_title")}
          on_change={(next) => {
            if (!recovering) set_method(next);
          }}
          options={[
            { id: "code", label: t("auth.recovery_code_label") },
            { id: "password", label: t("settings.previous_password") },
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
        ) : (
          <div className="mt-4 flex flex-col gap-1.5">
            <label
              className="text-xs font-medium text-txt-secondary"
              htmlFor="recover_data_password"
            >
              {t("settings.previous_password")}
            </label>
            <div className="relative">
              <input
                ref={field_ref}
                autoComplete="off"
                className={`${FIELD_CLASS} pe-10`}
                data-form-type="other"
                disabled={recovering}
                id="recover_data_password"
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
