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
import { useState, useEffect, useRef } from "react";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert_dialog";

export interface ReplyFromMismatchState {
  open: boolean;
  received: string;
  selected: string;
  can_use_received: boolean;
  on_cancel: () => void;
  on_send_anyway: () => void;
  on_use_received: () => void;
}

const ANIMATION_DURATION = 150;

export function ReplyFromMismatchModal({
  open,
  received,
  selected,
  can_use_received,
  on_cancel,
  on_send_anyway,
  on_use_received,
}: ReplyFromMismatchState) {
  const { t } = use_i18n();
  const [internal_open, set_internal_open] = useState(false);
  const closing_ref = useRef(false);

  useEffect(() => {
    if (open) {
      closing_ref.current = false;
      requestAnimationFrame(() => set_internal_open(true));
    } else {
      closing_ref.current = false;
      set_internal_open(false);
    }
  }, [open]);

  useEffect(() => {
    if (internal_open) return;
    const timer = window.setTimeout(() => {
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "";
      }
    }, ANIMATION_DURATION + 50);

    return () => window.clearTimeout(timer);
  }, [internal_open]);

  const close_with_animation = (action: () => void) => {
    if (closing_ref.current) return;
    closing_ref.current = true;
    set_internal_open(false);
    setTimeout(action, ANIMATION_DURATION);
  };

  return (
    <AlertDialog
      open={internal_open}
      onOpenChange={(next) => {
        if (!next) close_with_animation(on_cancel);
      }}
    >
      <AlertDialogContent
        className="gap-0 p-0 overflow-hidden max-w-[420px]"
        on_overlay_click={() => close_with_animation(on_cancel)}
      >
        <div className="px-6 pt-6 pb-5">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-[16px] font-semibold">
              {t("mail.reply_from_mismatch_title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-normal break-words">
              {t("mail.reply_from_mismatch_message", {
                received,
                selected,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <AlertDialogFooter className="flex-row flex-wrap justify-end gap-1 px-4 pb-4 pt-0">
          <Button
            className="mt-0"
            size="lg"
            variant="ghost"
            onClick={() => close_with_animation(on_cancel)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="mt-0"
            size="lg"
            variant="ghost"
            onClick={() => close_with_animation(on_send_anyway)}
          >
            {t("mail.reply_from_mismatch_send_anyway")}
          </Button>
          {can_use_received && (
            <Button
              className="mt-0 font-semibold"
              size="lg"
              style={{ color: "var(--accent-color)" }}
              variant="ghost"
              onClick={() => close_with_animation(on_use_received)}
            >
              {t("mail.reply_from_mismatch_use_received")}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
