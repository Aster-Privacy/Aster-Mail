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
import { useCallback, useState, useRef, useMemo } from "react";

import {
  type HeadingLevel,
  type TextAlignment,
  type FontSizeLabel,
  type EditorFormatState,
  FONT_SIZE_MAP,
  validate_hex_color,
  is_inside_list,
  is_inside_tag,
  get_current_block_tag,
  escape_html,
} from "@/hooks/editor_utils";

export function use_editor_format(
  editor_ref: React.RefObject<HTMLDivElement | null>,
  is_plain_text_mode: boolean,
  handle_input: () => void,
) {
  const [format_state, set_format_state] = useState<EditorFormatState>({
    active_formats: new Set(),
    current_heading: "p",
    current_alignment: "left",
    is_in_blockquote: false,
    is_in_ordered_list: false,
    is_in_unordered_list: false,
    current_font_color: "",
    current_bg_color: "",
    current_font_size: "",
  });

  const saved_selection_ref = useRef<Range | null>(null);

  const is_mac = useMemo(() => {
    if (typeof navigator !== "undefined") {
      return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    }

    return false;
  }, []);

  const save_selection = useCallback(() => {
    const editor = editor_ref.current;

    if (!editor) return;

    const selection = window.getSelection();

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      if (editor.contains(range.commonAncestorContainer)) {
        saved_selection_ref.current = range.cloneRange();
      }
    }
  }, [editor_ref]);

  const restore_selection = useCallback(() => {
    const editor = editor_ref.current;

    if (!editor) return;

    editor.focus();
    const selection = window.getSelection();

    if (!selection) return;

    if (saved_selection_ref.current) {
      selection.removeAllRanges();
      selection.addRange(saved_selection_ref.current);
    } else if (
      selection.rangeCount === 0 ||
      !editor.contains(selection.anchorNode)
    ) {
      const range = document.createRange();

      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [editor_ref]);

  const check_active_formats = useCallback(() => {
    const editor = editor_ref.current;

    if (!editor) return;

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    if (!editor.contains(range.commonAncestorContainer)) return;

    const formats = new Set<string>();

    try {
      if (document.queryCommandState("bold")) formats.add("bold");
      if (document.queryCommandState("italic")) formats.add("italic");
      if (document.queryCommandState("underline")) formats.add("underline");
      if (document.queryCommandState("strikeThrough"))
        formats.add("strikethrough");

      const anchor = selection.anchorNode;

      if (is_inside_list(anchor, "ol")) formats.add("orderedList");
      if (is_inside_list(anchor, "ul")) formats.add("unorderedList");

      const in_blockquote = is_inside_tag(anchor, "blockquote");
      const block_tag = get_current_block_tag(anchor);

      let heading: HeadingLevel = "p";

      if (block_tag === "h1") heading = "h1";
      else if (block_tag === "h2") heading = "h2";
      else if (block_tag === "h3") heading = "h3";

      let alignment: TextAlignment = "left";

      try {
        if (document.queryCommandState("justifyCenter")) alignment = "center";
        else if (document.queryCommandState("justifyRight"))
          alignment = "right";
        else if (document.queryCommandState("justifyFull"))
          alignment = "justify";
      } catch {
        alignment = "left";
      }

      let font_color = "";
      let bg_color = "";
      let font_size = "";

      try {
        font_color = document.queryCommandValue("foreColor") || "";
        bg_color =
          document.queryCommandValue("hiliteColor") ||
          document.queryCommandValue("backColor") ||
          "";
        font_size = document.queryCommandValue("fontSize") || "";
      } catch {}

      set_format_state({
        active_formats: formats,
        current_heading: heading,
        current_alignment: alignment,
        is_in_blockquote: in_blockquote,
        is_in_ordered_list: formats.has("orderedList"),
        is_in_unordered_list: formats.has("unorderedList"),
        current_font_color: font_color,
        current_bg_color: bg_color,
        current_font_size: font_size,
      });
    } catch {
      return;
    }
  }, [editor_ref]);

  const exec_format = useCallback(
    (command: string, value?: string) => {
      const editor = editor_ref.current;

      if (!editor || is_plain_text_mode) return;

      const selection = window.getSelection();

      if (
        !selection ||
        selection.rangeCount === 0 ||
        !editor.contains(selection.anchorNode)
      ) {
        restore_selection();
      } else {
        editor.focus();
      }

      document.execCommand(command, false, value);
      handle_input();
      requestAnimationFrame(() => {
        save_selection();
        check_active_formats();
      });
    },
    [
      editor_ref,
      is_plain_text_mode,
      restore_selection,
      handle_input,
      save_selection,
      check_active_formats,
    ],
  );

  const toggle_bold = useCallback(() => exec_format("bold"), [exec_format]);
  const toggle_italic = useCallback(() => exec_format("italic"), [exec_format]);
  const toggle_underline = useCallback(
    () => exec_format("underline"),
    [exec_format],
  );
  const toggle_strikethrough = useCallback(
    () => exec_format("strikeThrough"),
    [exec_format],
  );

  const split_br_in_list_items = useCallback(() => {
    const editor = editor_ref.current;

    if (!editor) return;

    const lists = editor.querySelectorAll("ol, ul");

    lists.forEach((list) => {
      const items = Array.from(list.querySelectorAll("li"));

      items.forEach((li) => {
        const brs = li.querySelectorAll("br");

        if (brs.length === 0) return;

        const frag = document.createDocumentFragment();
        const temp = document.createElement("div");

        temp.innerHTML = li.innerHTML;

        const parts = temp.innerHTML.split(/<br\s*\/?>/gi);

        parts.forEach((part) => {
          const trimmed = part.replace(/&nbsp;/g, " ").trim();

          if (!trimmed) return;

          const new_li = document.createElement("li");

          new_li.innerHTML = part;
          frag.appendChild(new_li);
        });

        if (frag.childNodes.length > 0) {
          li.replaceWith(frag);
        }
      });
    });
  }, [editor_ref]);

  const toggle_ordered_list = useCallback(() => {
    exec_format("insertOrderedList");
    requestAnimationFrame(split_br_in_list_items);
  }, [exec_format, split_br_in_list_items]);

  const toggle_unordered_list = useCallback(() => {
    exec_format("insertUnorderedList");
    requestAnimationFrame(split_br_in_list_items);
  }, [exec_format, split_br_in_list_items]);

  const insert_blockquote = useCallback(() => {
    const editor = editor_ref.current;

    if (!editor || is_plain_text_mode) return;

    restore_selection();

    if (format_state.is_in_blockquote) {
      document.execCommand("outdent", false);
    } else {
      document.execCommand(
        "insertHTML",
        false,
        '<blockquote style="border-left: 3px solid #ccc; padding-left: 12px; margin: 4px 0;"><br></blockquote>',
      );
    }

    handle_input();
    requestAnimationFrame(() => {
      save_selection();
      check_active_formats();
    });
  }, [
    editor_ref,
    is_plain_text_mode,
    restore_selection,
    format_state.is_in_blockquote,
    handle_input,
    save_selection,
    check_active_formats,
  ]);

  const insert_horizontal_rule = useCallback(() => {
    const editor = editor_ref.current;

    if (!editor || is_plain_text_mode) return;

    restore_selection();
    document.execCommand("insertHorizontalRule", false);
    handle_input();
    requestAnimationFrame(() => {
      save_selection();
      check_active_formats();
    });
  }, [
    editor_ref,
    is_plain_text_mode,
    restore_selection,
    handle_input,
    save_selection,
    check_active_formats,
  ]);

  const set_heading = useCallback(
    (level: HeadingLevel) => {
      const editor = editor_ref.current;

      if (!editor || is_plain_text_mode) return;

      restore_selection();

      if (level === "p") {
        document.execCommand("formatBlock", false, "p");
      } else {
        document.execCommand("formatBlock", false, level);
      }

      handle_input();
      requestAnimationFrame(() => {
        save_selection();
        check_active_formats();
      });
    },
    [
      editor_ref,
      is_plain_text_mode,
      restore_selection,
      handle_input,
      save_selection,
      check_active_formats,
    ],
  );

  const set_alignment = useCallback(
    (alignment: TextAlignment) => {
      const command_map: Record<TextAlignment, string> = {
        left: "justifyLeft",
        center: "justifyCenter",
        right: "justifyRight",
        justify: "justifyFull",
      };

      exec_format(command_map[alignment]);
    },
    [exec_format],
  );

  const remove_formatting = useCallback(() => {
    exec_format("removeFormat");
    exec_format("unlink");
  }, [exec_format]);

  const insert_link = useCallback(
    (url: string, text?: string) => {
      const editor = editor_ref.current;

      if (!editor || is_plain_text_mode) return;

      const trimmed_url = url.trim();
      const lower_url = trimmed_url.toLowerCase();

      if (
        !lower_url.startsWith("http://") &&
        !lower_url.startsWith("https://") &&
        !lower_url.startsWith("mailto:")
      ) {
        return;
      }

      const safe_url = encodeURI(trimmed_url).replace(/"/g, "%22");

      restore_selection();
      const selection = window.getSelection();
      const selected_text = selection?.toString() || "";

      if (selected_text && !text) {
        document.execCommand("createLink", false, safe_url);
        editor.querySelectorAll(`a[href="${safe_url}"]`).forEach((link) => {
          (link as HTMLElement).style.color = "#3b82f6";
          (link as HTMLElement).style.textDecoration = "underline";
        });
      } else {
        const link_text = text || trimmed_url;
        const safe_text = escape_html(link_text);

        document.execCommand(
          "insertHTML",
          false,
          `<a href="${safe_url}" style="color: #3b82f6; text-decoration: underline;">${safe_text}</a>`,
        );
      }

      handle_input();
      requestAnimationFrame(() => {
        save_selection();
        check_active_formats();
      });
    },
    [
      editor_ref,
      is_plain_text_mode,
      restore_selection,
      handle_input,
      save_selection,
      check_active_formats,
    ],
  );

  const insert_emoji = useCallback(
    (emoji: string) => {
      const editor = editor_ref.current;

      if (!editor) return;

      restore_selection();
      document.execCommand("insertText", false, emoji);
      handle_input();
      requestAnimationFrame(save_selection);
    },
    [editor_ref, restore_selection, handle_input, save_selection],
  );

  const insert_text = useCallback(
    (text: string) => {
      const editor = editor_ref.current;

      if (!editor) return;

      editor.focus();
      document.execCommand("insertText", false, text);
      handle_input();
    },
    [editor_ref, handle_input],
  );

  const insert_html = useCallback(
    (html: string) => {
      const editor = editor_ref.current;

      if (!editor || is_plain_text_mode) return;

      restore_selection();
      document.execCommand("insertHTML", false, html);
      handle_input();
      requestAnimationFrame(() => {
        save_selection();
        check_active_formats();
      });
    },
    [
      editor_ref,
      is_plain_text_mode,
      restore_selection,
      handle_input,
      save_selection,
      check_active_formats,
    ],
  );

  const set_font_color = useCallback(
    (color: string) => {
      if (!validate_hex_color(color)) return;

      exec_format("foreColor", color);
    },
    [exec_format],
  );

  const set_background_color = useCallback(
    (color: string) => {
      if (!validate_hex_color(color)) return;

      exec_format("hiliteColor", color);
    },
    [exec_format],
  );

  const set_font_size = useCallback(
    (size: FontSizeLabel) => {
      const editor = editor_ref.current;

      if (!editor || is_plain_text_mode) return;

      const px = FONT_SIZE_MAP[size];
      const font_size_index =
        size === "small"
          ? "2"
          : size === "normal"
            ? "3"
            : size === "large"
              ? "5"
              : "7";

      restore_selection();
      document.execCommand("fontSize", false, font_size_index);

      editor.querySelectorAll("font[size]").forEach((font) => {
        const span = document.createElement("span");

        span.style.fontSize = px;
        while (font.firstChild) {
          span.appendChild(font.firstChild);
        }
        font.replaceWith(span);
      });

      handle_input();
      requestAnimationFrame(() => {
        save_selection();
        check_active_formats();
      });
    },
    [
      editor_ref,
      is_plain_text_mode,
      restore_selection,
      handle_input,
      save_selection,
      check_active_formats,
    ],
  );

  return {
    format_state,
    is_mac,
    save_selection,
    restore_selection,
    check_active_formats,
    exec_format,
    toggle_bold,
    toggle_italic,
    toggle_underline,
    toggle_strikethrough,
    toggle_ordered_list,
    toggle_unordered_list,
    insert_blockquote,
    insert_horizontal_rule,
    set_heading,
    set_alignment,
    remove_formatting,
    insert_link,
    insert_emoji,
    insert_text,
    insert_html,
    set_font_color,
    set_background_color,
    set_font_size,
  };
}
