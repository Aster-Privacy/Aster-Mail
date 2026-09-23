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
import { clamp_password } from "@/services/sanitize";
import { recover_locked_data } from "@/services/locked_data";
import { is_composing } from "@/utils/ime";

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
  const [password, set_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [recovering, set_recovering] = useState(false);
  const password_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!is_open) return;

    const timer = setTimeout(() => password_ref.current?.focus(), 150);

    return () => clearTimeout(timer);
  }, [is_open]);

  const close = useCallback(() => {
    if (recovering) return;
    set_password("");
    set_show_password(false);
    on_close();
  }, [recovering, on_close]);

  const handle_recover = useCallback(async () => {
    if (recovering || !password) return;

    set_recovering(true);

    const result = await recover_locked_data(account_id, password);

    set_recovering(false);

    if (result.restored_key_sets > 0 || result.recovered_sent_mail > 0) {
      show_toast(t("common.recover_data_success"), "success");
      set_password("");
      set_show_password(false);
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
  }, [recovering, password, account_id, t, on_close]);

  return (
    <Modal is_open={is_open} on_close={close} size="sm">
      <ModalHeader>
        <ModalTitle>{t("common.recover_data_title")}</ModalTitle>
        <ModalDescription>
          {t("common.recover_data_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium text-txt-secondary"
            htmlFor="recover_data_password"
          >
            {t("settings.previous_password")}
          </label>
          <div className="relative">
            <input
              ref={password_ref}
              autoComplete="off"
              className="w-full px-3 py-2.5 pe-10 rounded-xl text-sm text-txt-primary bg-surf-secondary border border-edge-secondary focus:border-brand focus:outline-none transition-colors"
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
      </ModalBody>
      <ModalFooter>
        <Button disabled={recovering} variant="outline" onClick={close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={recovering || !password}
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
