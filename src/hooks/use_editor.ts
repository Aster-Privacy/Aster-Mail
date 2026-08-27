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
import { useCallback, useEffect } from "react";

import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { sanitize_compose_paste, sanitize_html } from "@/lib/html_sanitizer";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import {
  type HeadingLevel,
  type TextAlignment,
  type FontSizeLabel,
  type EditorFormatState,
  type UseEditorOptions,
  type ImageResizeState,
  type UseEditorReturn,
  validate_image_magic_bytes,
  MAX_PASTE_IMAGE_SIZE,
} from "@/hooks/editor_utils";
import { use_editor_image } from "@/hooks/use_editor_image";
import { describe_would_exceed_total } from "@/services/attachment_rejection";
import { use_editor_format } from "@/hooks/use_editor_format";
import { strip_image_metadata_data_url } from "@/lib/strip_image_metadata";

export type {
  HeadingLevel,
  TextAlignment,
  FontSizeLabel,
  EditorFormatState,
  UseEditorOptions,
  ImageResizeState,
  UseEditorReturn,
};

export function use_editor({
  editor_ref,
  on_change,
  enable_rich_paste = false,
  enable_keyboard_shortcuts = true,
  is_plain_text_mode = false,
  on_files_drop,
  strip_exif_on_compose = false,
  get_inline_image_budget,
}: UseEditorOptions): UseEditorReturn {
  const { t } = use_i18n();

  const fits_inline_budget = useCallback(
    (file: File): boolean => {
      if (!get_inline_image_budget) return true;

      const editor = editor_ref.current;
      const existing = editor
        ? Array.from(editor.querySelectorAll('img[src^="data:"]')).reduce(
            (total, img) => {
              const source = img.getAttribute("src") ?? "";
              const base64 = source.slice(source.indexOf(",") + 1);

              return total + Math.floor(base64.length * 0.75);
            },
            0,
          )
        : 0;

      return existing + file.size <= get_inline_image_budget();
    },
    [get_inline_image_budget, editor_ref],
  );

  const handle_input = useCallback(() => {
    const editor = editor_ref.current;

    if (editor) {
      on_change?.(is_plain_text_mode ? editor.innerText : editor.innerHTML);
    }
  }, [editor_ref, on_change, is_plain_text_mode]);

  const apply_signature = useCallback(
    (html: string | null) => {
      const editor = editor_ref.current;

      if (!editor) return;

      const existing = editor.querySelector<HTMLElement>(
        "[data-aster-signature='1']",
      );

      if (!html) {
        if (!existing) return;

        existing.remove();
        handle_input();

        return;
      }

      if (is_plain_text_mode) return;

      const sanitized = sanitize_html(html, {
        external_content_mode: is_any_lockdown_active() ? "never" : "always",
        lockdown_mode: is_any_lockdown_active(),
      });
      const wrapper = document.createElement("div");

      wrapper.innerHTML = sanitized.html;
      const new_node = wrapper.firstElementChild;

      if (!new_node) return;

      if (existing) {
        existing.replaceWith(new_node);
      } else {
        editor.appendChild(new_node);
      }
      handle_input();
    },
    [editor_ref, handle_input, is_plain_text_mode],
  );

  const fmt = use_editor_format(editor_ref, is_plain_text_mode, handle_input);

  const {
    selected_image_ref,
    dragged_image_ref,
    selected_image,
    update_image_rect,
    deselect_image,
    delete_selected_image,
    start_image_resize,
    set_image_width,
  } = use_editor_image(editor_ref, handle_input);

  const handle_paste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const editor = editor_ref.current;

      if (!editor) return;

      if (is_plain_text_mode || !enable_rich_paste) {
        const text = e.clipboardData.getData("text/plain");

        document.execCommand("insertText", false, text);
        handle_input();

        return;
      }

      const items = e.clipboardData.items;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.type.startsWith("image/") && item.type !== "image/svg+xml") {
          const file = item.getAsFile();

          if (!file) continue;

          if (file.size > MAX_PASTE_IMAGE_SIZE) {
            if (on_files_drop) {
              on_files_drop([file]);

              return;
            }
            show_toast(t("common.image_size_error"), "error");

            return;
          }

          if (!fits_inline_budget(file)) {
            if (on_files_drop) {
              on_files_drop([file]);

              return;
            }
            show_toast(describe_would_exceed_total(t, file.name), "error");

            return;
          }

          const reader = new FileReader();

          reader.onerror = () => {
            show_toast(t("common.valid_image_error"), "error");
          };
          reader.onload = async () => {
            try {
              let data_url = reader.result as string;
              const arr_buf = Uint8Array.from(
                atob(data_url.split(",")[1] || ""),
                (c) => c.charCodeAt(0),
              ).buffer;

              if (!validate_image_magic_bytes(arr_buf, file.type)) {
                show_toast(t("common.valid_image_error"), "error");

                return;
              }

              if (strip_exif_on_compose) {
                data_url = await strip_image_metadata_data_url(data_url);
              }

              const escaped_name = file.name
                .replace(/&/g, "&amp;")
                .replace(/"/g, "&quot;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

              document.execCommand(
                "insertHTML",
                false,
                `<div><img src="${data_url}" data-filename="${escaped_name}" draggable="true" style="max-width: 100%; height: auto; display: block; margin: 8px 0;" /></div><div><br></div>`,
              );
              handle_input();
            } catch {
              show_toast(t("common.valid_image_error"), "error");
            }
          };
          reader.readAsDataURL(file);

          return;
        }
      }

      const html_data = e.clipboardData.getData("text/html");

      if (html_data) {
        const sanitized = sanitize_compose_paste(html_data);

        document.execCommand("insertHTML", false, sanitized);
        handle_input();

        return;
      }

      const text = e.clipboardData.getData("text/plain");

      document.execCommand("insertText", false, text);
      handle_input();
    },
    [
      editor_ref,
      is_plain_text_mode,
      enable_rich_paste,
      handle_input,
      strip_exif_on_compose,
      on_files_drop,
      t,
      fits_inline_budget,
    ],
  );

  const handle_drag_over = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handle_drop = useCallback(
    (e: React.DragEvent) => {
      const editor = editor_ref.current;

      if (dragged_image_ref.current && editor) {
        e.preventDefault();
        e.stopPropagation();
        const img = dragged_image_ref.current;

        dragged_image_ref.current = null;

        const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);

        if (range && editor.contains(range.startContainer)) {
          img.remove();
          range.insertNode(img);
          const after = document.createRange();

          after.setStartAfter(img);
          after.collapse(true);
          const sel = window.getSelection();

          if (sel) {
            sel.removeAllRanges();
            sel.addRange(after);
          }
          handle_input();
          selected_image_ref.current = img;
          update_image_rect();
        }

        return;
      }

      const files = e.dataTransfer?.files;

      if (!files || files.length === 0) return;

      e.preventDefault();
      e.stopPropagation();

      const drop_editor = editor_ref.current;
      const image_files: File[] = [];
      const non_image_files: File[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (
          file.type.startsWith("image/") &&
          file.type !== "image/svg+xml" &&
          file.size <= MAX_PASTE_IMAGE_SIZE
        ) {
          image_files.push(file);
        } else {
          non_image_files.push(file);
        }
      }

      const can_inline_first =
        !!drop_editor &&
        !is_plain_text_mode &&
        enable_rich_paste &&
        image_files.length > 0 &&
        fits_inline_budget(image_files[0]);

      if (can_inline_first) {
        const file = image_files[0];
        const reader = new FileReader();

        reader.onerror = () => {
          show_toast(t("common.valid_image_error"), "error");
        };
        reader.onload = async () => {
          try {
            let data_url = reader.result as string;
            const arr_buf = Uint8Array.from(
              atob(data_url.split(",")[1] || ""),
              (c) => c.charCodeAt(0),
            ).buffer;

            if (!validate_image_magic_bytes(arr_buf, file.type)) {
              show_toast(t("common.valid_image_error"), "error");

              return;
            }

            if (strip_exif_on_compose) {
              data_url = await strip_image_metadata_data_url(data_url);
            }

            const escaped_name = file.name
              .replace(/&/g, "&amp;")
              .replace(/"/g, "&quot;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");

            drop_editor.focus();
            document.execCommand(
              "insertHTML",
              false,
              `<div><img src="${data_url}" data-filename="${escaped_name}" draggable="true" style="max-width: 100%; height: auto; display: block; margin: 8px 0;" /></div><div><br></div>`,
            );
            handle_input();
          } catch {
            show_toast(t("common.valid_image_error"), "error");
          }
        };
        reader.readAsDataURL(file);
      }

      const all_non_inline = [
        ...non_image_files,
        ...image_files.slice(can_inline_first ? 1 : 0),
      ];

      if (all_non_inline.length > 0) {
        if (on_files_drop) {
          on_files_drop(all_non_inline);
        } else if (non_image_files.length > 0) {
          show_toast(t("common.valid_image_error"), "error");
        } else {
          show_toast(t("common.image_size_error"), "error");
        }
      }
    },
    [
      editor_ref,
      is_plain_text_mode,
      enable_rich_paste,
      handle_input,
      on_files_drop,
      update_image_rect,
      strip_exif_on_compose,
      t,
      fits_inline_budget,
    ],
  );

  const get_html = useCallback((): string => {
    return editor_ref.current?.innerHTML || "";
  }, [editor_ref]);

  const set_html = useCallback(
    (html: string) => {
      const editor = editor_ref.current;

      if (editor) {
        editor.innerHTML = sanitize_compose_paste(html);
        handle_input();
      }
    },
    [editor_ref, handle_input],
  );

  const focus = useCallback(() => {
    editor_ref.current?.focus();
  }, [editor_ref]);

  useEffect(() => {
    let pending_frame: number | null = null;

    const handle_selection = () => {
      const editor = editor_ref.current;
      const selection = window.getSelection();

      if (!editor || !selection || selection.rangeCount === 0) return;
      if (!editor.contains(selection.anchorNode)) return;

      fmt.save_selection();

      if (pending_frame !== null) return;

      pending_frame = requestAnimationFrame(() => {
        pending_frame = null;
        fmt.check_active_formats();
      });
    };

    document.addEventListener("selectionchange", handle_selection);

    return () => {
      if (pending_frame !== null) cancelAnimationFrame(pending_frame);
      document.removeEventListener("selectionchange", handle_selection);
    };
  }, [editor_ref, fmt.check_active_formats, fmt.save_selection]);

  useEffect(() => {
    if (!enable_keyboard_shortcuts) return;

    const editor = editor_ref.current;

    if (!editor) return;

    const handle_keydown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if (!mod) return;

      const key = e.key.toLowerCase();

      if (key === "b") {
        e.preventDefault();
        document.execCommand("bold", false);
        handle_input();
        requestAnimationFrame(fmt.check_active_formats);

        return;
      }

      if (key === "i") {
        e.preventDefault();
        document.execCommand("italic", false);
        handle_input();
        requestAnimationFrame(fmt.check_active_formats);

        return;
      }

      if (key === "u") {
        e.preventDefault();
        document.execCommand("underline", false);
        handle_input();
        requestAnimationFrame(fmt.check_active_formats);

        return;
      }

      if (e.shiftKey && key === "x") {
        e.preventDefault();
        document.execCommand("strikeThrough", false);
        handle_input();
        requestAnimationFrame(fmt.check_active_formats);

        return;
      }

      if (e.shiftKey && key === "7") {
        e.preventDefault();
        document.execCommand("insertOrderedList", false);
        handle_input();
        requestAnimationFrame(fmt.check_active_formats);

        return;
      }

      if (e.shiftKey && key === "8") {
        e.preventDefault();
        document.execCommand("insertUnorderedList", false);
        handle_input();
        requestAnimationFrame(fmt.check_active_formats);

        return;
      }

      if (e.shiftKey && key === "9") {
        e.preventDefault();
        fmt.insert_blockquote();

        return;
      }
    };

    editor.addEventListener("keydown", handle_keydown);

    return () => editor.removeEventListener("keydown", handle_keydown);
  }, [
    editor_ref,
    enable_keyboard_shortcuts,
    handle_input,
    fmt.check_active_formats,
    fmt.insert_blockquote,
  ]);

  return {
    format_state: fmt.format_state,
    exec_format: fmt.exec_format,
    toggle_bold: fmt.toggle_bold,
    toggle_italic: fmt.toggle_italic,
    toggle_underline: fmt.toggle_underline,
    toggle_strikethrough: fmt.toggle_strikethrough,
    toggle_ordered_list: fmt.toggle_ordered_list,
    toggle_unordered_list: fmt.toggle_unordered_list,
    insert_blockquote: fmt.insert_blockquote,
    insert_horizontal_rule: fmt.insert_horizontal_rule,
    set_heading: fmt.set_heading,
    set_alignment: fmt.set_alignment,
    remove_formatting: fmt.remove_formatting,
    insert_link: fmt.insert_link,
    insert_emoji: fmt.insert_emoji,
    insert_text: fmt.insert_text,
    insert_html: fmt.insert_html,
    apply_signature,
    set_font_color: fmt.set_font_color,
    set_background_color: fmt.set_background_color,
    set_font_size: fmt.set_font_size,
    handle_paste,
    handle_drop,
    handle_drag_over,
    handle_input,
    save_selection: fmt.save_selection,
    restore_selection: fmt.restore_selection,
    get_html,
    set_html,
    focus,
    is_mac: fmt.is_mac,
    selected_image,
    deselect_image,
    start_image_resize,
    delete_selected_image,
    set_image_width,
  };
}
