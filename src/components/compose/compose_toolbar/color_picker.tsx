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
  useId,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";

import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";

import { PRESET_COLORS, use_anchored_layer } from "./shared";

export function ColorPickerPopover({
  font_color,
  bg_color,
  on_font_color_change,
  on_bg_color_change,
  on_before_open,
}: {
  font_color: string;
  bg_color: string;
  on_font_color_change: (color: string) => void;
  on_bg_color_change: (color: string) => void;
  on_before_open?: () => void;
}) {
  const { t } = use_i18n();
  const [open, set_open] = useState(false);
  const [mode, set_mode] = useState<"text" | "highlight">("text");
  const [pos, set_pos] = useState({ top: 0, center_x: 0 });
  const [custom_hex, set_custom_hex] = useState("#000000");
  const button_ref = useRef<HTMLButtonElement>(null);
  const dropdown_ref = useRef<HTMLDivElement>(null);
  const panel_id = useId();

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

  const active_color =
    mode === "text" ? font_color || "#000000" : bg_color || "#ffff00";

  useEffect(() => {
    if (!open) return;
    set_custom_hex(active_color);
  }, [open, mode]);

  const close_popover = useCallback(() => set_open(false), []);

  use_escape_layer(open, close_popover, "compose_color_picker");

  use_anchored_layer(
    open,
    button_ref,
    (rect) =>
      set_pos({ top: rect.top, center_x: rect.left + rect.width / 2 }),
    close_popover,
  );

  const handle_color_select = (color: string) => {
    set_custom_hex(color);
    if (mode === "text") {
      on_font_color_change(color);
    } else {
      on_bg_color_change(color);
    }
    set_open(false);
  };

  return (
    <div>
      <button
        ref={button_ref}
        aria-controls={open ? panel_id : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="press_scale w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-full transition-transform duration-150 hover:bg-black/5 dark:hover:bg-white/10 text-txt-tertiary hover:text-txt-primary"
        title={t("mail.font_color")}
        type="button"
        onClick={() => {
          if (!open) {
            on_before_open?.();
          }
          set_open(!open);
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="w-4 h-4 flex flex-col items-center justify-end">
          <svg className="w-4 h-3.5" fill="currentColor" viewBox="0 0 24 20">
            <path d="M11 2L5.5 16h2.25l1.12-3h6.25l1.12 3h2.25L13 2h-2zm-1.38 9L12 4.67 14.38 11H9.62z" />
          </svg>
          <div
            className="w-full h-[3px] rounded-sm"
            style={{ backgroundColor: font_color || "#000000" }}
          />
        </div>
      </button>
      {createPortal(
        open && (
          <div
            ref={dropdown_ref}
            className="fixed -translate-x-1/2 rounded-2xl shadow-lg border w-[280px] bg-modal-bg border-edge-primary"
            id={panel_id}
            style={{
              zIndex: 9999,
              left: pos.center_x,
              bottom: window.innerHeight - pos.top + 8,
            }}
          >
            <div className="p-2 pb-0">
              <div className="flex gap-1 p-1 rounded-full bg-black/5 dark:bg-white/5">
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 h-7 text-xs whitespace-nowrap cursor-pointer rounded-full transition-colors duration-150 ${mode === "text" ? "bg-modal-bg shadow-sm font-medium text-txt-primary" : "text-txt-muted hover:text-txt-primary"}`}
                  type="button"
                  onClick={() => set_mode("text")}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 24 20"
                  >
                    <path d="M11 2L5.5 16h2.25l1.12-3h6.25l1.12 3h2.25L13 2h-2zm-1.38 9L12 4.67 14.38 11H9.62z" />
                  </svg>
                  {t("mail.font_color")}
                </button>
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 h-7 text-xs whitespace-nowrap cursor-pointer rounded-full transition-colors duration-150 ${mode === "highlight" ? "bg-modal-bg shadow-sm font-medium text-txt-primary" : "text-txt-muted hover:text-txt-primary"}`}
                  type="button"
                  onClick={() => set_mode("highlight")}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M17.75 7L14 3.25l-10 10V17h3.75l10-10zm2.96-2.96a.996.996 0 000-1.41L18.37.29a.996.996 0 00-1.41 0L15 2.25 18.75 6l1.96-1.96z" />
                    <path d="M2 20h20v4H2z" opacity="0.3" />
                  </svg>
                  {t("mail.highlight_color")}
                </button>
              </div>
            </div>
            <div className="p-2.5">
              <div className="grid grid-cols-8 gap-1.5">
                {PRESET_COLORS.map((color) => {
                  const selected =
                    color.toLowerCase() === active_color.toLowerCase();

                  return (
                    <button
                      key={color}
                      className="w-6 h-6 rounded-full cursor-pointer transition-transform duration-100 hover:scale-125 active:scale-95"
                      style={{
                        backgroundColor: color,
                        boxShadow: selected
                          ? `0 0 0 2px var(--bg-modal, ${color === "#ffffff" ? "#fff" : "transparent"}), 0 0 0 3.5px var(--text-primary)`
                          : color === "#ffffff" || color === "#efefef"
                            ? "inset 0 0 0 1px rgba(128,128,128,0.45)"
                            : "none",
                      }}
                      title={color}
                      type="button"
                      onClick={() => handle_color_select(color)}
                      onMouseDown={(e) => e.preventDefault()}
                    />
                  );
                })}
              </div>
              <div className="mt-2.5 pt-2.5 border-t flex items-center gap-2 border-edge-secondary">
                <div
                  className="w-6 h-6 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: active_color,
                    boxShadow:
                      active_color === "#ffffff"
                        ? "inset 0 0 0 1px rgba(128,128,128,0.45)"
                        : "none",
                  }}
                />
                <Input
                  className="w-full bg-transparent"
                  maxLength={7}
                  size="sm"
                  type="text"
                  value={custom_hex}
                  onChange={(e) => {
                    const val = e.target.value;

                    set_custom_hex(val);
                    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                      if (mode === "text") {
                        on_font_color_change(val);
                      } else {
                        on_bg_color_change(val);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      set_open(false);
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
        ),
        document.body,
      )}
    </div>
  );
}

