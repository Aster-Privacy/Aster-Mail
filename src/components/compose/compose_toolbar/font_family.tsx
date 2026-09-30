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
import type {} from "@/lib/i18n/types";

import { useId, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

import { use_anchored_layer } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import {
  DEFAULT_FONT_FAMILY,
  FONT_FAMILY_OPTIONS,
  font_family_option_from_css,
} from "@/hooks/editor_utils";

export function FontFamilySelect({
  on_change,
  on_before_open,
  font_family,
}: {
  on_change: (family: string) => void;
  on_before_open?: () => void;
  font_family?: string;
}) {
  const { t } = use_i18n();
  const [open, set_open] = useState(false);
  const [current_family, set_current_family] =
    useState<string>(DEFAULT_FONT_FAMILY);
  const [pos, set_pos] = useState({ top: 0, left: 0 });
  const button_ref = useRef<HTMLButtonElement>(null);
  const dropdown_ref = useRef<HTMLDivElement>(null);
  const list_id = useId();
  const current_option = FONT_FAMILY_OPTIONS.find(
    (o) => o.stack === current_family,
  );

  useEffect(() => {
    if (open) return;

    const option = font_family ? font_family_option_from_css(font_family) : null;

    set_current_family(option ? option.stack : DEFAULT_FONT_FAMILY);
  }, [font_family, open]);

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

  use_escape_layer(open, close_dropdown, "compose_font_family");

  use_anchored_layer(
    open,
    button_ref,
    (rect) => set_pos({ top: rect.top, left: rect.left }),
    close_dropdown,
  );

  const select = (family: string) => {
    set_current_family(family);
    on_change(family);
    set_open(false);
  };

  return (
    <div>
      <button
        ref={button_ref}
        aria-controls={open ? list_id : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("common.font_family_label")}
        className="h-7 px-2 text-xs rounded-[var(--aster-radius-item)] cursor-pointer flex items-center gap-1 transition-colors hover:bg-[var(--aster-hover)] whitespace-nowrap bg-transparent text-txt-muted"
        data-testid="compose_font_family"
        title={t("common.font_family_label")}
        type="button"
        onClick={() => {
          if (!open) on_before_open?.();
          set_open(!open);
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <span className="max-w-[88px] truncate">
          {current_option
            ? current_option.name
            : t("common.font_family_default")}
        </span>
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
            className="aster_floating aster_floating_anim fixed p-1.5 min-w-[160px]"
            data-state="open"
            id={list_id}
            style={{
              zIndex: 9999,
              left: pos.left,
              bottom: window.innerHeight - pos.top + 6,
            }}
          >
            <button
              className="w-full text-start px-2.5 py-1.5 text-[13px] text-txt-primary rounded-[var(--aster-radius-item)] transition-colors hover:bg-[var(--aster-floating-hover)]"
              style={{
                fontWeight: current_option ? 400 : 600,
              }}
              type="button"
              onClick={() => select(DEFAULT_FONT_FAMILY)}
              onMouseDown={(e) => e.preventDefault()}
            >
              {t("common.font_family_default")}
            </button>
            {FONT_FAMILY_OPTIONS.map((option) => (
              <button
                key={option.stack}
                className="w-full text-start px-2.5 py-1.5 text-[13px] text-txt-primary rounded-[var(--aster-radius-item)] transition-colors hover:bg-[var(--aster-floating-hover)]"
                style={{
                  fontFamily: option.stack,
                  fontWeight: current_family === option.stack ? 600 : 400,
                }}
                type="button"
                onClick={() => select(option.stack)}
                onMouseDown={(e) => e.preventDefault()}
              >
                {option.name}
              </button>
            ))}
          </div>
        ),
        document.body,
      )}
    </div>
  );
}
