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
import type { ComposeToolbarState } from "@/components/compose/compose_shared";


import { use_i18n } from "@/lib/i18n/context";

import { AlignmentGroup } from "./alignment";
import { ColorPickerPopover } from "./color_picker";
import { FontSizeSelect } from "./font_size";
import { Divider, ToolbarButton, use_frozen_selection } from "./shared";

export function FormatTools({ compose }: { compose: ComposeToolbarState }) {
  const { t } = use_i18n();
  const editor = compose.editor;
  const mod = compose.is_mac ? "⌘" : "Ctrl";
  const { freeze_selection, apply_with_frozen_selection } =
    use_frozen_selection(editor);

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

      {editor && (
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
      )}

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

      {editor && (
        <>
          <Divider />
          <AlignmentGroup
            current={editor.format_state.current_alignment}
            on_change={editor.set_alignment}
          />
        </>
      )}

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

