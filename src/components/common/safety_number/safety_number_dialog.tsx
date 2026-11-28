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
import { useEffect, useState } from "react";
import { DocumentDuplicateIcon } from "@heroicons/react/24/outline";

import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { show_toast } from "@/components/toast/simple_toast";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import {
  clear_safety_number_verification,
  load_safety_number,
  mark_safety_number_verified,
  type SafetyNumberView,
} from "@/services/crypto/safety_number_status";

interface SafetyNumberDialogProps {
  is_open: boolean;
  email: string;
  name: string;
  on_close: () => void;
}

type Loaded = SafetyNumberView | "unavailable" | null;

export function SafetyNumberDialog({
  is_open,
  email,
  name,
  on_close,
}: SafetyNumberDialogProps) {
  const { t } = use_i18n();
  const [loaded, set_loaded] = useState<Loaded>(null);
  const [is_saving, set_is_saving] = useState(false);
  const label = name.trim() || email;

  useEffect(() => {
    if (!is_open) return;

    let live = true;

    set_loaded(null);
    void load_safety_number(email).then((view) => {
      if (live) set_loaded(view ?? "unavailable");
    });

    return () => {
      live = false;
    };
  }, [is_open, email]);

  const view = loaded && loaded !== "unavailable" ? loaded : null;

  const copy_number = async () => {
    if (!view) return;

    try {
      await navigator.clipboard.writeText(view.groups.join(" "));
      show_toast(t("common.copied_to_clipboard"), "success");
    } catch {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  const confirm = async () => {
    if (!view || is_saving) return;

    set_is_saving(true);

    const done =
      view.state === "verified"
        ? await clear_safety_number_verification(view.email)
        : await mark_safety_number_verified(view);

    set_is_saving(false);

    if (!done) {
      show_toast(t("common.safety_number_save_failed"), "error");
      set_loaded(null);
      set_loaded((await load_safety_number(email)) ?? "unavailable");

      return;
    }

    on_close();
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="sm">
      <ModalHeader>
        <ModalTitle>{t("common.safety_number")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <p className="text-[14px] leading-relaxed text-txt-secondary">
          {t("common.safety_number_description", { name: label })}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <ContactAvatar email={email} name={name} size_px={40} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-txt-primary">
              {label}
            </p>
            {view?.state === "verified" && (
              <p className="text-[13px] text-txt-muted">
                {t("common.safety_number_verified")}
              </p>
            )}
            {view?.state === "changed" && (
              <p className="text-[13px] text-txt-muted">
                {t("common.safety_number_changed")}
              </p>
            )}
          </div>
        </div>
        {loaded === null && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
        {loaded === "unavailable" && (
          <p
            className="mt-5 text-[14px] text-txt-secondary"
            data-testid="safety_number_unavailable"
          >
            {t("common.safety_number_unavailable")}
          </p>
        )}
        {view && (
          <>
            <div
              aria-label={t("common.safety_number")}
              className="mt-5 grid grid-cols-4 gap-x-4 gap-y-3 rounded-2xl bg-surf-secondary px-5 py-4 font-mono text-[17px] tabular-nums tracking-wide text-txt-primary select-text"
              data-testid="safety_number_groups"
              dir="ltr"
              role="group"
            >
              {view.groups.map((group, index) => (
                <span key={index} className="text-center">
                  {group}
                </span>
              ))}
            </div>
            <button
              className="aster_btn aster_btn_ghost aster_btn_sm mt-3"
              type="button"
              onClick={() => void copy_number()}
            >
              <DocumentDuplicateIcon className="h-4 w-4" />
              {t("common.safety_number_copy")}
            </button>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <button
          className="aster_btn aster_btn_secondary aster_btn_sm"
          type="button"
          onClick={on_close}
        >
          {t("common.cancel")}
        </button>
        {view && (
          <button
            className="aster_btn aster_btn_primary aster_btn_sm"
            disabled={is_saving}
            type="button"
            onClick={() => void confirm()}
          >
            {view.state === "verified"
              ? t("common.safety_number_clear")
              : t("common.safety_number_mark_verified")}
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}
