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
import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert_dialog";

interface LinkDialogProps {
  open: boolean;
  on_close: () => void;
  on_insert: (url: string, text?: string) => void;
  selected_text?: string;
}

export function LinkDialog({
  open,
  on_close,
  on_insert,
  selected_text,
}: LinkDialogProps) {
  const { t } = use_i18n();
  const [url, set_url] = useState("https://");
  const [text, set_text] = useState(selected_text || "");
  const [error, set_error] = useState("");
  const [internal_open, set_internal_open] = useState(false);
  const url_input_ref = useRef<HTMLInputElement>(null);
  const closing_ref = useRef(false);

  useEffect(() => {
    if (open) {
      closing_ref.current = false;
      set_url("https://");
      set_text(selected_text || "");
      set_error("");
      requestAnimationFrame(() => {
        set_internal_open(true);
        requestAnimationFrame(() => url_input_ref.current?.focus());
      });
    } else {
      closing_ref.current = false;
      set_internal_open(false);
    }
  }, [open, selected_text]);

  const close_with_animation = useCallback((action: () => void) => {
    if (closing_ref.current) return;
    closing_ref.current = true;
    set_internal_open(false);
    setTimeout(action, 150);
  }, []);

  const validate_url = useCallback((value: string): boolean => {
    const trimmed = value.trim().toLowerCase();

    return (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("mailto:")
    );
  }, []);

  const handle_submit = useCallback(() => {
    const trimmed_url = url.trim();

    if (!trimmed_url || !validate_url(trimmed_url)) {
      set_error(t("common.please_enter_valid_url"));

      return;
    }

    close_with_animation(() => {
      on_insert(trimmed_url, text.trim() || undefined);
    });
  }, [url, text, validate_url, on_insert, close_with_animation]);

  const handle_cancel = useCallback(() => {
    close_with_animation(on_close);
  }, [close_with_animation, on_close]);

  return (
    <AlertDialog
      open={internal_open}
      onOpenChange={(o) => {
        if (!o) handle_cancel();
      }}
    >
      <AlertDialogContent
        className="gap-0 p-0 overflow-hidden max-w-[380px]"
        on_overlay_click={handle_cancel}
      >
        <div className="px-6 pt-6 pb-5">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-[16px] font-semibold">
              {t("mail.insert_link_title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-normal">
              {selected_text
                ? t("mail.add_link_to_selection", { text: selected_text.length > 40 ? selected_text.slice(0, 40) + "..." : selected_text })
                : t("common.enter_url_display_text")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 mt-4">
            <div>
              <label
                className="block text-xs font-medium mb-1.5 text-txt-secondary"
                htmlFor="link-dialog-url"
              >
                {t("mail.url_label")}
              </label>
              <Input
                ref={url_input_ref}
                className="w-full"
                id="link-dialog-url"
                placeholder={t("mail.url_placeholder")}
                status={error ? "error" : "default"}
                type="url"
                value={url}
                onChange={(e) => {
                  set_url(e.target.value);
                  set_error("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handle_submit();
                  }
                }}
              />
              {error && <p className="text-xs mt-1 text-red-500">{error}</p>}
            </div>

            {!selected_text && (
              <div>
                <label
                  className="block text-xs font-medium mb-1.5 text-txt-secondary"
                  htmlFor="link-dialog-text"
                >
                  {t("mail.link_text_optional")}
                </label>
                <Input
                  className="w-full"
                  id="link-dialog-text"
                  placeholder={t("mail.display_text_placeholder")}
                  type="text"
                  value={text}
                  onChange={(e) => set_text(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handle_submit();
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <AlertDialogFooter className="flex-row gap-3 px-6 pb-6 pt-2 sm:justify-end">
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
            onClick={handle_submit}
          >
            {t("mail.insert_link")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
