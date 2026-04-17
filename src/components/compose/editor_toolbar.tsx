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
import { useState } from "react";

import { use_editor } from "@/hooks/use_editor";
import { use_i18n } from "@/lib/i18n/context";
import { LinkDialog } from "@/components/compose/link_dialog";

interface EditorToolbarProps {
  editor_ref: React.RefObject<HTMLDivElement | null>;
  on_change?: () => void;
}

interface ToolbarButtonProps {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  "aria-label"?: string;
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
  "aria-label": aria_label,
}: ToolbarButtonProps) {
  return (
    <button
      aria-label={aria_label || title}
      className={`
        p-1.5 rounded-md transition-all duration-150
        ${active ? "bg-blue-500/15 text-blue-500" : "hover:bg-black/5 dark:hover:bg-white/10 text-txt-muted"}
      `}
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
  return <div className="w-px h-5 mx-1 bg-edge-secondary" />;
}

export function EditorToolbar({ editor_ref, on_change }: EditorToolbarProps) {
  const { t } = use_i18n();
  const editor = use_editor({
    editor_ref,
    on_change: on_change ? () => on_change() : undefined,
    enable_rich_paste: false,
    enable_keyboard_shortcuts: true,
  });

  const [show_link_dialog, set_show_link_dialog] = useState(false);
  const [selected_text_for_link, set_selected_text_for_link] = useState("");

  const handle_open_link_dialog = () => {
    editor.save_selection();
    set_selected_text_for_link(window.getSelection()?.toString() || "");
    set_show_link_dialog(true);
  };

  const { format_state } = editor;

  return (
    <div
      aria-label={t("mail.text_formatting")}
      className="flex items-center gap-0.5 py-1.5 px-1"
      role="toolbar"
    >
      <ToolbarButton
        active={format_state.active_formats.has("bold")}
        title={`${t("mail.bold")} (${editor.is_mac ? "\u2318" : "Ctrl"}+B)`}
        onClick={editor.toggle_bold}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={format_state.active_formats.has("italic")}
        title={`${t("mail.italic")} (${editor.is_mac ? "\u2318" : "Ctrl"}+I)`}
        onClick={editor.toggle_italic}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={format_state.active_formats.has("underline")}
        title={`${t("mail.underline")} (${editor.is_mac ? "\u2318" : "Ctrl"}+U)`}
        onClick={editor.toggle_underline}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={format_state.active_formats.has("strikethrough")}
        title={`${t("mail.strikethrough")} (${editor.is_mac ? "\u2318" : "Ctrl"}+Shift+X)`}
        onClick={editor.toggle_strikethrough}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={format_state.active_formats.has("unorderedList")}
        title={t("mail.bullet_list")}
        onClick={editor.toggle_unordered_list}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={format_state.active_formats.has("orderedList")}
        title={t("mail.numbered_list")}
        onClick={editor.toggle_ordered_list}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={format_state.is_in_blockquote}
        title={`${t("mail.blockquote")} (${editor.is_mac ? "\u2318" : "Ctrl"}+Shift+9)`}
        onClick={editor.insert_blockquote}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <div className="relative">
        <ToolbarButton
          active={show_link_dialog}
          title={t("mail.insert_link")}
          onClick={handle_open_link_dialog}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
          </svg>
        </ToolbarButton>
        <LinkDialog
          on_close={() => set_show_link_dialog(false)}
          on_insert={(url, text) => editor.insert_link(url, text)}
          open={show_link_dialog}
          selected_text={selected_text_for_link}
        />
      </div>

      <ToolbarButton
        title={t("mail.horizontal_rule")}
        onClick={editor.insert_horizontal_rule}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M4 11h16v2H4z" />
        </svg>
      </ToolbarButton>
    </div>
  );
}
