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
import { EnvelopeIcon } from "@heroicons/react/24/outline";
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

export type UnsubscribeConfirmKind = "url" | "mailto" | "one_click";

interface UnsubscribeConfirmRequest {
  kind: UnsubscribeConfirmKind;
  destination: string;
  sender_name?: string;
  resolve: (confirmed: boolean) => void;
}

let current_request: UnsubscribeConfirmRequest | null = null;
let listeners: Array<(req: UnsubscribeConfirmRequest | null) => void> = [];

function notify() {
  for (const listener of listeners) {
    listener(current_request);
  }
}

export function confirm_unsubscribe(
  kind: UnsubscribeConfirmKind,
  destination: string,
  sender_name?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (current_request) {
      current_request.resolve(false);
    }
    current_request = { kind, destination, sender_name, resolve };
    notify();
  });
}

const ANIMATION_DURATION = 150;

export function UnsubscribeConfirmationModal() {
  const { t } = use_i18n();
  const [request, set_request] = useState<UnsubscribeConfirmRequest | null>(
    null,
  );
  const [internal_open, set_internal_open] = useState(false);
  const closing_ref = useRef(false);

  useEffect(() => {
    const listener = (req: UnsubscribeConfirmRequest | null) => {
      if (req) {
        closing_ref.current = false;
        set_request(req);
        set_internal_open(true);
      }
    };

    listeners.push(listener);

    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const close_with_animation = (confirmed: boolean) => {
    if (closing_ref.current) return;
    closing_ref.current = true;
    const req = request;

    set_internal_open(false);
    setTimeout(() => {
      if (req && current_request === req) {
        current_request = null;
      }
      if (req) {
        req.resolve(confirmed);
      }
      set_request(null);
    }, ANIMATION_DURATION);
  };

  const handle_confirm = () => close_with_animation(true);
  const handle_cancel = () => close_with_animation(false);

  const get_display_host = () => {
    if (!request) return "";
    if (request.kind === "mailto") {
      return request.destination;
    }
    try {
      const parsed = new URL(request.destination);

      return parsed.hostname;
    } catch {
      return request.destination.length > 50
        ? request.destination.slice(0, 50) + "..."
        : request.destination;
    }
  };

  return (
    <AlertDialog
      open={internal_open}
      onOpenChange={(open) => {
        if (!open) handle_cancel();
      }}
    >
      <AlertDialogContent
        className="gap-0 p-0 overflow-hidden max-w-[440px] max-sm:max-w-none max-sm:w-full max-sm:h-full max-sm:rounded-none max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0"
        on_overlay_click={handle_cancel}
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 px-6 pt-6 pb-5 max-sm:pt-[env(safe-area-inset-top,0px)]">
            <AlertDialogHeader className="space-y-2">
              <AlertDialogTitle className="text-[16px] font-semibold flex items-center gap-2">
                <EnvelopeIcon
                  className="w-5 h-5"
                  style={{ color: "var(--text-muted)" }}
                />
                {t("mail.unsubscribe_title")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[14px] leading-normal">
                {t("mail.unsubscribe_confirm_message")}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div
              className="mt-4 p-3 rounded-lg"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-secondary)",
              }}
            >
              <p
                className="text-[13px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {get_display_host()}
              </p>
              <p
                className="text-[12px] break-all mt-1.5 max-h-[30vh] overflow-y-auto"
                style={{ color: "var(--color-info)" }}
              >
                {request?.kind === "mailto"
                  ? `mailto:${request.destination}`
                  : (request?.destination ?? "")}
              </p>
            </div>
          </div>

          <AlertDialogFooter className="flex-row gap-3 px-6 pb-6 pt-2 sm:justify-end max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            <Button
              className="mt-0 max-sm:flex-1"
              size="xl"
              variant="outline"
              onClick={handle_cancel}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="max-sm:flex-1"
              size="xl"
              variant="depth"
              onClick={handle_confirm}
            >
              {t("mail.unsubscribe")}
            </Button>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
