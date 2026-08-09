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
import type { } from "@/lib/i18n/types";
import type { } from "@/components/compose/compose_shared";

import {
  
  useState,
  useRef,
  useEffect,
  
  
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";

import { use_anchored_layer } from "./shared";

export function LinkPopover({
  open,
  anchor_ref,
  selected_text,
  on_close,
  on_insert,
}: {
  open: boolean;
  anchor_ref: React.RefObject<HTMLButtonElement | null>;
  selected_text: string;
  on_close: () => void;
  on_insert: (url: string, text?: string) => void;
}) {
  const { t } = use_i18n();
  const [url, set_url] = useState("https://");
  const [text, set_text] = useState("");
  const [pos, set_pos] = useState({ top: 0, left: 0 });
  const card_ref = useRef<HTMLDivElement>(null);
  const url_input_ref = useRef<HTMLInputElement>(null);

  use_escape_layer(open, on_close, "compose_link_popover");

  use_anchored_layer(
    open,
    anchor_ref,
    (rect) =>
      set_pos({
        top: rect.top,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 308)),
      }),
    on_close,
  );

  useEffect(() => {
    if (!open) return;
    set_url("https://");
    set_text(selected_text);
    requestAnimationFrame(() => url_input_ref.current?.focus());

    const handle_click_outside = (e: MouseEvent) => {
      const target = e.target as Node;

      if (anchor_ref.current?.contains(target)) return;
      if (card_ref.current?.contains(target)) return;
      on_close();
    };

    document.addEventListener("mousedown", handle_click_outside);

    return () =>
      document.removeEventListener("mousedown", handle_click_outside);
  }, [open]);

  const handle_insert = () => {
    const trimmed = url.trim().toLowerCase();
    const valid =
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("mailto:");

    if (!valid) return;
    on_insert(url.trim(), text.trim() || undefined);
    on_close();
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={card_ref}
      className="fixed w-[300px] rounded-xl border shadow-lg p-3 flex flex-col gap-2 bg-modal-bg border-edge-primary"
      style={{
        zIndex: 9999,
        left: pos.left,
        bottom: window.innerHeight - pos.top + 8,
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handle_insert();
        }
      }}
    >
      <Input
        ref={url_input_ref}
        className="w-full"
        placeholder={t("mail.url_placeholder")}
        size="sm"
        type="url"
        value={url}
        onChange={(e) => set_url(e.target.value)}
      />
      {!selected_text && (
        <Input
          className="w-full"
          placeholder={t("mail.display_text_placeholder")}
          size="sm"
          type="text"
          value={text}
          onChange={(e) => set_text(e.target.value)}
        />
      )}
      <div className="flex justify-end gap-2 mt-0.5">
        <Button size="sm" variant="outline" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" variant="depth" onClick={handle_insert}>
          {t("mail.insert_link")}
        </Button>
      </div>
    </div>,
    document.body,
  );
}

