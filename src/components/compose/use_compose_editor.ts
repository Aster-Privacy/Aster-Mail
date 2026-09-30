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
import { useState, useCallback } from "react";

import { use_editor, type UseEditorReturn } from "@/hooks/use_editor";
import { escape_html } from "@/hooks/editor_utils";
import { use_preferences } from "@/contexts/preferences_context";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

export interface UseComposeEditorOptions {
  message_textarea_ref: React.RefObject<HTMLDivElement | null>;
  set_message: (val: string) => void;
  on_files_drop: (files: File[]) => void;
  get_recipient_name?: () => string;
  get_inline_image_budget?: () => number;
}

export interface UseComposeEditorReturn {
  editor: UseEditorReturn;
  is_plain_text_mode: boolean;
  show_plain_text_confirm: boolean;
  toggle_plain_text_mode: () => void;
  confirm_plain_text_mode: () => void;
  cancel_plain_text_confirm: () => void;
  handle_editor_input: () => void;
  handle_editor_paste: (e: React.ClipboardEvent) => void;
  handle_template_select: (content: string) => void;
  exec_format_command: (command: string) => void;
}

export function use_compose_editor({
  message_textarea_ref,
  set_message,
  on_files_drop,
  get_recipient_name,
  get_inline_image_budget,
}: UseComposeEditorOptions): UseComposeEditorReturn {
  const { preferences } = use_preferences();

  const [is_plain_text_mode, set_is_plain_text_mode] = useState(
    preferences.compose_mode === "plain_text",
  );

  const editor = use_editor({
    editor_ref: message_textarea_ref as React.RefObject<HTMLDivElement | null>,
    on_change: (html: string) => set_message(html),
    enable_rich_paste: !is_plain_text_mode,
    enable_keyboard_shortcuts: !is_plain_text_mode,
    is_plain_text_mode,
    on_files_drop,
    strip_exif_on_compose: preferences.strip_exif_on_compose,
    get_inline_image_budget,
  });

  const [show_plain_text_confirm, set_show_plain_text_confirm] =
    useState(false);

  const toggle_plain_text_mode = useCallback(() => {
    const editor_el = message_textarea_ref.current;

    if (is_plain_text_mode) {
      if (editor_el) {
        const text = editor_el.innerText || "";
        const html = escape_html(text).replace(/\n/g, "<br>");

        editor_el.innerHTML = html;
        set_message(html);
      }

      set_is_plain_text_mode(false);
    } else {
      set_show_plain_text_confirm(true);
    }
  }, [is_plain_text_mode, set_message]);

  const confirm_plain_text_mode = useCallback(() => {
    const editor_el = message_textarea_ref.current;

    if (editor_el) {
      const text = editor_el.innerText || "";

      editor_el.innerText = text;
      set_message(text);
    }

    set_is_plain_text_mode(true);
    set_show_plain_text_confirm(false);
  }, [set_message]);

  const cancel_plain_text_confirm = useCallback(
    () => set_show_plain_text_confirm(false),
    [],
  );

  const handle_editor_input = useCallback(() => {
    editor.handle_input();
  }, [editor]);

  const handle_editor_paste = useCallback(
    (e: React.ClipboardEvent) => {
      editor.handle_paste(e);
    },
    [editor],
  );

  const handle_template_select = useCallback(
    (content: string) => {
      const recipient_name = get_recipient_name?.() ?? "";
      const substituted = content
        .replace(
          /\[Date\]/g,
          new Date().toLocaleDateString(app_locale(), {
            timeZone: get_display_time_zone(),
          }),
        )
        .replace(/\[Name\]/g, recipient_name);
      const escaped = substituted
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const html = `<div>${escaped.replace(/\n/g, "<br>")}</div>`;

      editor.insert_html(html);
    },
    [editor, get_recipient_name],
  );

  const exec_format_command = useCallback(
    (command: string) => {
      editor.exec_format(command);
    },
    [editor],
  );

  return {
    editor,
    is_plain_text_mode,
    show_plain_text_confirm,
    toggle_plain_text_mode,
    confirm_plain_text_mode,
    cancel_plain_text_confirm,
    handle_editor_input,
    handle_editor_paste,
    handle_template_select,
    exec_format_command,
  };
}
