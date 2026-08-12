// AGPL-3.0 License
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
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
import { use_i18n } from "@/lib/i18n/context";
import { clamp_password } from "@/services/sanitize";
import {
  count_inactive_key_sets,
  restore_inactive_key_sets,
} from "@/services/crypto/restore_inactive_keys";

export function RecoverOlderDataSection() {
  const { t } = use_i18n();
  const [pending, set_pending] = useState(0);
  const [is_open, set_is_open] = useState(false);
  const [old_password, set_old_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [restoring, set_restoring] = useState(false);
  const password_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    count_inactive_key_sets()
      .then((count) => {
        if (!cancelled) set_pending(count);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (is_open) setTimeout(() => password_ref.current?.focus(), 150);
  }, [is_open]);

  const close = useCallback(() => {
    set_is_open(false);
    set_old_password("");
    set_show_password(false);
  }, []);

  const handle_restore = useCallback(async () => {
    if (restoring || !old_password) return;

    set_restoring(true);

    try {
      const restored = await restore_inactive_key_sets(old_password);

      if (restored > 0) {
        set_pending(await count_inactive_key_sets());
        show_toast(t("settings.resurrection_success"), "success");
        close();
      } else {
        show_toast(t("settings.resurrection_failed"), "error");
      }
    } catch {
      show_toast(t("settings.resurrection_failed"), "error");
    }

    set_restoring(false);
  }, [restoring, old_password, t, close]);

  if (pending === 0) return null;

  return (
    <>
      <div className="py-4 px-1">
        <div className="flex items-center justify-between">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.recover_older_data_title")}
            </p>
            <p className="text-xs mt-0.5 text-txt-muted">
              {t("settings.recover_older_data_desc")}
            </p>
          </div>
          <Button variant="depth" onClick={() => set_is_open(true)}>
            {t("settings.recover_older_data_button")}
          </Button>
        </div>
      </div>

      <Modal is_open={is_open} on_close={close} size="sm">
        <ModalHeader>
          <ModalTitle>{t("settings.recover_older_data_title")}</ModalTitle>
          <ModalDescription>
            {t("settings.resurrection_old_password_prompt")}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-txt-secondary">
              {t("settings.resurrection_old_password")}
            </label>
            <div className="relative">
              <input
                ref={password_ref}
                type={show_password ? "text" : "password"}
                autoComplete="off"
                data-form-type="other"
                className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm text-txt-primary bg-surf-secondary border border-edge-secondary focus:border-brand focus:outline-none transition-colors"
                value={old_password}
                maxLength={128}
                disabled={restoring}
                onChange={(e) => set_old_password(clamp_password(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handle_restore();
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary transition-colors"
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
          <Button variant="outline" disabled={restoring} onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="depth"
            disabled={restoring || !old_password}
            onClick={handle_restore}
          >
            {restoring ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mx-auto" />
            ) : (
              t("settings.recover_older_data_button")
            )}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
