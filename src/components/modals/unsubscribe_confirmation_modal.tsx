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

export type UnsubscribeConfirmKind = "url" | "mailto" | "one_click" | "bulk";

interface UnsubscribeConfirmRequest {
  kind: UnsubscribeConfirmKind;
  destination: string;
  sender_name?: string;
  bulk_count?: number;
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

export function confirm_unsubscribe_bulk(count: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (current_request) {
      current_request.resolve(false);
    }
    current_request = {
      kind: "bulk",
      destination: "",
      bulk_count: count,
      resolve,
    };
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
      set_request((prev) => (prev === req ? null : prev));
    }, ANIMATION_DURATION);
  };

  const handle_confirm = () => close_with_animation(true);
  const handle_cancel = () => close_with_animation(false);

  const is_bulk = request?.kind === "bulk";

  const get_title = () => {
    if (!request) return "";
    if (request.kind === "bulk") {
      return t("mail.unsubscribe_senders_title", {
        count: request.bulk_count ?? 0,
      });
    }
    const name = request.sender_name?.trim();

    return name
      ? t("mail.unsubscribe_from_sender_title", { name })
      : t("mail.unsubscribe_from_list_title");
  };

  const get_body = () => {
    if (!request) return "";
    if (request.kind === "bulk") return t("mail.unsubscribe_bulk_body");
    if (request.kind === "mailto") return t("mail.unsubscribe_mailto_body");
    if (request.kind === "one_click")
      return t("mail.unsubscribe_one_click_body");

    return t("mail.unsubscribe_link_body");
  };

  const get_display_host = () => {
    if (!request || request.kind === "bulk") return "";
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

  const full_destination =
    request?.kind === "mailto"
      ? `mailto:${request.destination}`
      : (request?.destination ?? "");
  const display_host = get_display_host();

  return (
    <AlertDialog
      open={internal_open}
      onOpenChange={(open) => {
        if (!open) handle_cancel();
      }}
    >
      <AlertDialogContent
        className="gap-0 p-0 overflow-hidden w-[calc(100%-2rem)] max-w-[420px]"
        on_overlay_click={handle_cancel}
      >
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-5">
            <AlertDialogHeader className="space-y-2 text-start">
              <AlertDialogTitle className="text-[16px] font-semibold [overflow-wrap:anywhere]">
                {get_title()}
              </AlertDialogTitle>
              <AlertDialogDescription
                className="text-[14px] leading-5"
                style={{ color: "var(--text-tertiary)" }}
              >
                {get_body()}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {!is_bulk && display_host && (
              <div className="mt-5">
                <p className="text-start text-[16px] font-semibold leading-5 text-txt-primary [overflow-wrap:anywhere]">
                  {display_host}
                </p>
                {full_destination && full_destination !== display_host && (
                  <p className="mt-1 select-text text-start text-[14px] leading-[22px] text-txt-muted line-clamp-2 break-all">
                    {full_destination}
                  </p>
                )}
              </div>
            )}
          </div>

          <AlertDialogFooter className="flex-row flex-wrap gap-3 px-6 pb-6 pt-2 sm:justify-end max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            <Button
              className="mt-0 whitespace-nowrap max-sm:flex-1"
              variant="outline"
              onClick={handle_cancel}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="whitespace-nowrap max-sm:flex-1"
              variant="depth_destructive"
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
