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
import type { TranslationKey } from "@/lib/i18n/types";
import type { TextAlignment, FontSizeLabel } from "@/hooks/use_editor";
import type { ComposeToolbarState } from "@/components/compose/compose_shared";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { AttachmentIcon } from "@/components/common/icons";
import { use_i18n } from "@/lib/i18n/context";
import { LinkDialog } from "@/components/compose/link_dialog";
import { format_last_saved } from "@/components/compose/compose_shared";
import EmojiPicker from "@/components/compose/emoji_picker";

const PRESET_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#b7b7b7",
  "#cccccc",
  "#efefef",
  "#ffffff",
  "#980000",
  "#ff0000",
  "#ff9900",
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#0000ff",
  "#9900ff",
  "#e6b8af",
  "#f4cccc",
  "#fce5cd",
  "#fff2cc",
  "#d9ead3",
  "#d0e0e3",
  "#c9daf8",
  "#d9d2e9",
  "#dd7e6b",
  "#ea9999",
  "#f9cb9c",
  "#ffe599",
  "#b6d7a8",
  "#a2c4c9",
  "#6d9eeb",
  "#8e7cc3",
  "#cc4125",
  "#e06666",
  "#f6b26b",
  "#ffd966",
  "#93c47d",
  "#76a5af",
  "#6fa8dc",
  "#c27ba0",
];

const FONT_SIZE_OPTIONS: { value: FontSizeLabel; label_key: TranslationKey }[] =
  [
    { value: "small", label_key: "settings.font_size_small" },
    { value: "normal", label_key: "settings.font_size_default" },
    { value: "large", label_key: "settings.font_size_large" },
    { value: "huge", label_key: "settings.font_size_extra_large" },
  ];

interface ToolbarButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}

export function ToolbarButton({
  onClick,
  children,
  disabled,
  active,
  title,
}: ToolbarButtonProps) {
  return (
    <button
      className={`p-1.5 rounded transition-colors duration-150 disabled:opacity-50 ${active ? "bg-blue-500/15" : "hover:bg-black/5 dark:hover:bg-white/10"} ${active ? "" : "text-txt-tertiary"}`}
      disabled={disabled}
      style={active ? { color: "var(--color-info)" } : undefined}
      title={title}
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 mx-0.5 flex-shrink-0 bg-edge-secondary" />;
}

function FontSizeSelect({
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

  return (
    <div>
      <button
        ref={button_ref}
        aria-label={t("common.font_size_label")}
        className="h-7 px-2 text-xs rounded border cursor-pointer flex items-center gap-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10 whitespace-nowrap bg-transparent border-edge-secondary text-txt-muted"
        type="button"
        onClick={() => {
          if (!open && button_ref.current) {
            on_before_open?.();
            const rect = button_ref.current.getBoundingClientRect();

            set_pos({ top: rect.top, left: rect.left });
          }
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
        <AnimatePresence>
          {open && (
            <motion.div
              ref={dropdown_ref}
              animate={{ opacity: 1, y: 0 }}
              className="fixed rounded-lg border shadow-lg py-1 min-w-[110px] bg-modal-bg border-edge-primary"
              exit={{ opacity: 0, y: 4 }}
              initial={{ opacity: 0, y: 4 }}
              style={{
                zIndex: 9999,
                left: pos.left,
                bottom: window.innerHeight - pos.top + 6,
              }}
              transition={{ duration: 0.12 }}
            >
              {FONT_SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${current_size === option.value ? "" : "text-txt-primary"}`}
                  style={{
                    color:
                      current_size === option.value
                        ? "var(--color-info)"
                        : undefined,
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
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function ColorPickerPopover({
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
    set_custom_hex(active_color);
  }, [active_color, mode]);

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
        className="p-1.5 rounded transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/10 text-txt-tertiary"
        title={t("mail.font_color")}
        type="button"
        onClick={() => {
          if (!open && button_ref.current) {
            on_before_open?.();
            const rect = button_ref.current.getBoundingClientRect();

            set_pos({
              top: rect.top,
              center_x: rect.left + rect.width / 2,
            });
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
        <AnimatePresence>
          {open && (
            <motion.div
              ref={dropdown_ref}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              className="fixed rounded-xl shadow-xl border w-[272px] bg-modal-bg border-edge-primary"
              exit={{ opacity: 0, y: 4, x: "-50%" }}
              initial={{ opacity: 0, y: 4, x: "-50%" }}
              style={{
                zIndex: 9999,
                left: pos.center_x,
                bottom: window.innerHeight - pos.top + 8,
              }}
              transition={{ duration: 0.12 }}
            >
              <div className="flex border-b border-edge-secondary">
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs whitespace-nowrap cursor-pointer bg-transparent hover:bg-transparent ${mode === "text" ? "font-medium" : "text-txt-muted"}`}
                  style={{
                    color: mode === "text" ? "var(--color-info)" : undefined,
                    borderBottom:
                      mode === "text"
                        ? "2px solid var(--color-info)"
                        : "2px solid transparent",
                  }}
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
                  className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs whitespace-nowrap cursor-pointer bg-transparent hover:bg-transparent ${mode === "highlight" ? "font-medium" : "text-txt-muted"}`}
                  style={{
                    color:
                      mode === "highlight" ? "var(--color-info)" : undefined,
                    borderBottom:
                      mode === "highlight"
                        ? "2px solid var(--color-info)"
                        : "2px solid transparent",
                  }}
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
              <div className="p-2.5">
                <div className="grid grid-cols-8 gap-1">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      className="w-5 h-5 rounded-sm cursor-pointer"
                      style={{
                        backgroundColor: color,
                        boxShadow:
                          color === "#ffffff"
                            ? "inset 0 0 0 1px #d1d5db"
                            : "none",
                      }}
                      type="button"
                      onClick={() => handle_color_select(color)}
                      onMouseDown={(e) => e.preventDefault()}
                    />
                  ))}
                </div>
                <div className="mt-2.5 pt-2.5 border-t flex items-center gap-2 border-edge-secondary">
                  <div
                    className="w-6 h-6 rounded flex-shrink-0"
                    style={{
                      backgroundColor: active_color,
                      boxShadow:
                        active_color === "#ffffff"
                          ? "inset 0 0 0 1px #d1d5db"
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
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function AlignmentGroup({
  current,
  on_change,
}: {
  current: TextAlignment;
  on_change: (alignment: TextAlignment) => void;
}) {
  const { t } = use_i18n();

  return (
    <div
      aria-label={t("mail.text_alignment")}
      className="flex items-center gap-0.5"
      role="group"
    >
      <ToolbarButton
        active={current === "left"}
        title={t("mail.align_left")}
        onClick={() => on_change("left")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={current === "center"}
        title={t("mail.align_center")}
        onClick={() => on_change("center")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={current === "right"}
        title={t("mail.align_right")}
        onClick={() => on_change("right")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z" />
        </svg>
      </ToolbarButton>
    </div>
  );
}

function FormatTools({
  compose,
  show_link_dialog,
  selected_text_for_link,
  on_open_link_dialog,
  on_close_link_dialog,
  on_insert_link,
}: {
  compose: ComposeToolbarState;
  show_link_dialog: boolean;
  selected_text_for_link: string;
  on_open_link_dialog: () => void;
  on_close_link_dialog: () => void;
  on_insert_link: (url: string, text?: string) => void;
}) {
  const { t } = use_i18n();
  const editor = compose.editor;
  const mod = compose.is_mac ? "\u2318" : "Ctrl";

  const frozen_range_ref = useRef<Range | null>(null);

  const freeze_selection = useCallback(() => {
    const sel = window.getSelection();

    if (sel && sel.rangeCount > 0) {
      frozen_range_ref.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const apply_with_frozen_selection = useCallback(
    (fn: () => void) => {
      if (!editor) return;

      const frozen = frozen_range_ref.current;

      if (frozen) {
        editor.focus();
        const sel = window.getSelection();

        if (sel) {
          sel.removeAllRanges();
          sel.addRange(frozen);
        }
      }
      editor.save_selection();
      fn();
    },
    [editor],
  );

  const [show_emoji, set_show_emoji] = useState(false);
  const [emoji_pos, set_emoji_pos] = useState({ top: 0, right: 0 });
  const emoji_btn_ref = useRef<HTMLButtonElement>(null);
  const emoji_picker_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show_emoji) return;

    const handle_click_outside = (e: MouseEvent) => {
      const target = e.target as Node;

      if (emoji_btn_ref.current?.contains(target)) return;
      if (emoji_picker_ref.current?.contains(target)) return;
      set_show_emoji(false);
    };

    document.addEventListener("mousedown", handle_click_outside);

    return () =>
      document.removeEventListener("mousedown", handle_click_outside);
  }, [show_emoji]);

  return (
    <>
      {editor && (
        <>
          <FontSizeSelect
            on_before_open={freeze_selection}
            on_change={(size) =>
              apply_with_frozen_selection(() => editor.set_font_size(size))
            }
          />
          <Divider />
        </>
      )}

      {editor && (
        <>
          <ColorPickerPopover
            bg_color={editor.format_state.current_bg_color}
            font_color={editor.format_state.current_font_color}
            on_before_open={freeze_selection}
            on_bg_color_change={(color) =>
              apply_with_frozen_selection(() =>
                editor.set_background_color(color),
              )
            }
            on_font_color_change={(color) =>
              apply_with_frozen_selection(() => editor.set_font_color(color))
            }
          />
          <Divider />
        </>
      )}

      <ToolbarButton
        active={compose.active_formats.has("bold")}
        title={`${t("mail.bold")} (${mod}+B)`}
        onClick={() => compose.exec_format_command("bold")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={compose.active_formats.has("italic")}
        title={`${t("mail.italic")} (${mod}+I)`}
        onClick={() => compose.exec_format_command("italic")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={compose.active_formats.has("underline")}
        title={`${t("mail.underline")} (${mod}+U)`}
        onClick={() => compose.exec_format_command("underline")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={compose.active_formats.has("strikethrough")}
        title={`${t("mail.strikethrough")} (${mod}+Shift+X)`}
        onClick={() => compose.exec_format_command("strikeThrough")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={compose.active_formats.has("unorderedList")}
        title={t("mail.bullet_list")}
        onClick={() => editor?.toggle_unordered_list()}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={compose.active_formats.has("orderedList")}
        title={t("mail.numbered_list")}
        onClick={() => editor?.toggle_ordered_list()}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
        </svg>
      </ToolbarButton>

      <Divider />

      {editor && (
        <>
          <AlignmentGroup
            current={editor.format_state.current_alignment}
            on_change={editor.set_alignment}
          />
          <Divider />
        </>
      )}

      <div>
        <button
          ref={emoji_btn_ref}
          className={`p-1.5 rounded transition-colors duration-150 ${show_emoji ? "bg-blue-500/15" : "hover:bg-black/5 dark:hover:bg-white/10 text-txt-tertiary"}`}
          style={show_emoji ? { color: "var(--color-info)" } : undefined}
          title={t("common.emoji")}
          type="button"
          onClick={() => {
            if (!show_emoji && emoji_btn_ref.current) {
              freeze_selection();
              const rect = emoji_btn_ref.current.getBoundingClientRect();

              set_emoji_pos({
                top: rect.top,
                right: window.innerWidth - rect.right,
              });
            }
            set_show_emoji(!show_emoji);
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
          </svg>
        </button>
        {createPortal(
          <AnimatePresence>
            {show_emoji && (
              <div
                ref={emoji_picker_ref}
                className="fixed"
                style={{
                  zIndex: 9999,
                  right: emoji_pos.right,
                  bottom: window.innerHeight - emoji_pos.top + 8,
                }}
              >
                <EmojiPicker
                  on_select={(emoji) => {
                    apply_with_frozen_selection(() =>
                      editor?.insert_emoji(emoji),
                    );
                    set_show_emoji(false);
                  }}
                />
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
      </div>

      <div className="relative">
        <ToolbarButton
          active={show_link_dialog}
          title={t("mail.insert_link")}
          onClick={on_open_link_dialog}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
          </svg>
        </ToolbarButton>
        <LinkDialog
          on_close={on_close_link_dialog}
          on_insert={on_insert_link}
          open={show_link_dialog}
          selected_text={selected_text_for_link}
        />
      </div>

      <ToolbarButton
        title={t("mail.attach_file")}
        onClick={compose.trigger_file_select}
      >
        <AttachmentIcon className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        title={t("mail.remove_formatting")}
        onClick={() => editor?.remove_formatting()}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z" />
        </svg>
      </ToolbarButton>
    </>
  );
}

interface ComposeFormatBarProps {
  compose: ComposeToolbarState;
  reduce_motion: boolean;
}

export function ComposeFormatBar({ compose }: ComposeFormatBarProps) {
  const { t } = use_i18n();
  const [show_link_dialog, set_show_link_dialog] = useState(false);
  const [selected_text_for_link, set_selected_text_for_link] = useState("");

  const handle_open_link_dialog = () => {
    compose.editor?.save_selection();
    set_selected_text_for_link(window.getSelection()?.toString() || "");
    set_show_link_dialog(true);
  };

  const handle_insert_link = (url: string, text?: string) => {
    compose.editor?.insert_link(url, text);
  };

  return (
    <div
      aria-label={t("mail.text_formatting")}
      className="border-t px-3 py-1.5 flex items-center gap-0.5 flex-shrink-0 overflow-x-auto scrollbar-hide border-edge-primary"
      role="toolbar"
    >
      <FormatTools
        compose={compose}
        on_close_link_dialog={() => set_show_link_dialog(false)}
        on_insert_link={handle_insert_link}
        on_open_link_dialog={handle_open_link_dialog}
        selected_text_for_link={selected_text_for_link}
        show_link_dialog={show_link_dialog}
      />
    </div>
  );
}

interface ComposeToolbarProps {
  compose: ComposeToolbarState;
  reduce_motion: boolean;
  show_expiration?: boolean;
  extra_toolbar_items?: React.ReactNode;
}

export function ComposeToolbar({
  compose,
  reduce_motion,
  show_expiration = false,
  extra_toolbar_items,
}: ComposeToolbarProps) {
  const { t } = use_i18n();

  return (
    <div className="border-t px-3 py-2 flex items-center gap-2 flex-shrink-0 border-edge-primary">
      {compose.scheduled_time ? (
        <Button
          className="h-8 px-4"
          disabled={!compose.has_recipients || compose.is_scheduling}
          size="md"
          variant="depth"
          onClick={compose.handle_scheduled_send}
        >
          {compose.is_scheduling ? t("mail.scheduling") : t("mail.schedule")}
        </Button>
      ) : (
        <Button
          className="h-8 px-5"
          disabled={!compose.has_recipients}
          size="md"
          title={compose.is_mac ? "\u2318+Enter" : "Ctrl+Enter"}
          variant="depth"
          onClick={compose.handle_send}
        >
          {t("mail.send")}
        </Button>
      )}

      <div className="flex items-center gap-0.5">
        {compose.schedule_picker_element}

        {show_expiration && compose.expiration_picker_element}
      </div>

      {extra_toolbar_items}

      {compose.has_external_recipients && compose.toggle_pgp && (
        <ToolbarButton
          active={compose.pgp_enabled}
          title={
            compose.pgp_enabled
              ? t("mail.pgp_encryption_active")
              : t("mail.encrypt_with_pgp")
          }
          onClick={compose.toggle_pgp}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
          </svg>
        </ToolbarButton>
      )}

      {compose.template_picker_element}

      <AnimatePresence>
        {compose.draft_status !== "idle" && (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="text-xs flex items-center gap-1.5 px-2 overflow-hidden text-txt-muted"
            exit={{ opacity: 0, x: -8 }}
            initial={reduce_motion ? false : { opacity: 0, x: -8 }}
            transition={{ duration: reduce_motion ? 0 : 0.2, ease: "easeOut" }}
          >
            <AnimatePresence initial={false} mode="wait">
              {compose.draft_status === "saving" ? (
                <motion.div
                  key="saving"
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-1.5"
                  exit={{ opacity: 0 }}
                  initial={reduce_motion ? false : { opacity: 0 }}
                  transition={{ duration: reduce_motion ? 0 : 0.15 }}
                >
                  <svg
                    className="w-3.5 h-3.5 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  <span>{t("common.saving")}</span>
                </motion.div>
              ) : compose.draft_status === "error" ? (
                <motion.div
                  key="error"
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-1.5 text-red-500 dark:text-red-400"
                  exit={{ opacity: 0 }}
                  initial={reduce_motion ? false : { opacity: 0 }}
                  transition={{ duration: reduce_motion ? 0 : 0.15 }}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" x2="12" y1="8" y2="12" />
                    <line x1="12" x2="12.01" y1="16" y2="16" />
                  </svg>
                  <span>{t("common.save_failed")}</span>
                </motion.div>
              ) : (
                <motion.div
                  key="saved"
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-1.5"
                  exit={{ opacity: 0 }}
                  initial={reduce_motion ? false : { opacity: 0 }}
                  transition={{ duration: reduce_motion ? 0 : 0.15 }}
                >
                  <motion.svg
                    animate={{ scale: 1 }}
                    className="w-3.5 h-3.5"
                    fill="currentColor"
                    initial={reduce_motion ? false : { scale: 0 }}
                    transition={{
                      type: "tween",
                      ease: "easeOut",
                      duration: 0.2,
                    }}
                    viewBox="0 0 24 24"
                  >
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </motion.svg>
                  <span>
                    {compose.last_saved_time
                      ? format_last_saved(compose.last_saved_time, t)
                      : t("mail.saved")}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs hidden sm:inline text-txt-muted">
          {compose.is_mac ? "\u2318\u21B5" : "Ctrl+\u21B5"}
        </span>
        {compose.handle_show_delete_confirm && (
          <ToolbarButton
            title={t("common.delete_draft")}
            onClick={compose.handle_show_delete_confirm}
          >
            <svg
              className="w-4 h-4 text-red-400 dark:text-red-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </ToolbarButton>
        )}
      </div>
    </div>
  );
}
