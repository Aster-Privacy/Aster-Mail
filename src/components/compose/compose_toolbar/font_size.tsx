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
import type {  FontSizeLabel } from "@/hooks/use_editor";
import type { } from "@/components/compose/compose_shared";

import {
  useId,
  useState,
  useRef,
  useEffect,
  
  useCallback,
} from "react";
import { createPortal } from "react-dom";

import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";

import { FONT_SIZE_OPTIONS, use_anchored_layer } from "./shared";

export function FontSizeSelect({
  on_change,
  on_before_open,
}: {
  on_change: (size: FontSizeLabel) => void;
  on_before_open?: () => void;
}) {
  const { t } = use_i18n();
  const [open, set_open] = useState(false);
  const [current_size, set_current_size] = useState<FontSizeLabel>("normal");
  const [pos, set_pos] = useState({ top: 0, left: 0 });
  const button_ref = useRef<HTMLButtonElement>(null);
  const dropdown_ref = useRef<HTMLDivElement>(null);
  const list_id = useId();
  const current_option = FONT_SIZE_OPTIONS.find(
    (o) => o.value === current_size,
  );

  useEffect(() => {
    if (!open) return;

    const handle_click_outside = (e: MouseEvent) => {
      const target = e.target as Node;

      if (button_ref.current?.contains(target)) return;
      if (dropdown_ref.current?.contains(target)) return;
      set_open(false);
    };

    document.addEventListener("mousedown", handle_click_outside);

    return () =>
      document.removeEventListener("mousedown", handle_click_outside);
  }, [open]);

  const close_dropdown = useCallback(() => set_open(false), []);

  use_escape_layer(open, close_dropdown, "compose_font_size");

  use_anchored_layer(
    open,
    button_ref,
    (rect) => set_pos({ top: rect.top, left: rect.left }),
    close_dropdown,
  );

  return (
    <div>
      <button
        ref={button_ref}
        aria-controls={open ? list_id : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("common.font_size_label")}
        className="h-7 px-2 text-xs rounded-md cursor-pointer flex items-center gap-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10 whitespace-nowrap bg-transparent text-txt-muted"
        type="button"
        onClick={() => {
          if (!open) on_before_open?.();
          set_open(!open);
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {current_option
          ? t(current_option.label_key)
          : t("settings.font_size_default")}
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            clipRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            fillRule="evenodd"
          />
        </svg>
      </button>
      {createPortal(
        open && (
          <div
            ref={dropdown_ref}
            className="fixed rounded-xl border shadow-lg py-1 min-w-[110px] bg-modal-bg border-edge-primary"
            id={list_id}
            style={{
              zIndex: 9999,
              left: pos.left,
              bottom: window.innerHeight - pos.top + 6,
            }}
          >
            {FONT_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                className="w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10 text-txt-primary"
                style={{
                  fontWeight: current_size === option.value ? 600 : 400,
                }}
                type="button"
                onClick={() => {
                  set_current_size(option.value);
                  on_change(option.value);
                  set_open(false);
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {t(option.label_key)}
              </button>
            ))}
          </div>
        ),
        document.body,
      )}
    </div>
  );
}

