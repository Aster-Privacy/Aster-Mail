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
import type { ComposeToolbarState } from "@/components/compose/compose_shared";

import { ComposeIcon } from "@aster/ui";

import { AlignmentGroup } from "./alignment";
import { ColorPickerPopover } from "./color_picker";
import { FontSizeSelect } from "./font_size";
import { Divider, ToolbarButton, use_frozen_selection } from "./shared";

import { use_i18n } from "@/lib/i18n/context";

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
            font_size={editor.format_state.current_font_size}
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
        <ComposeIcon name="bold" />
      </ToolbarButton>
      <ToolbarButton
        active={compose.active_formats.has("italic")}
        title={`${t("mail.italic")} (${mod}+I)`}
        onClick={() => compose.exec_format_command("italic")}
      >
        <ComposeIcon name="italic" />
      </ToolbarButton>
      <ToolbarButton
        active={compose.active_formats.has("underline")}
        title={`${t("mail.underline")} (${mod}+U)`}
        onClick={() => compose.exec_format_command("underline")}
      >
        <ComposeIcon name="underline" />
      </ToolbarButton>
      <ToolbarButton
        active={compose.active_formats.has("strikethrough")}
        title={`${t("mail.strikethrough")} (${mod}+Shift+X)`}
        onClick={() => compose.exec_format_command("strikeThrough")}
      >
        <ComposeIcon name="strikethrough" />
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
        <ComposeIcon name="bullet_list" />
      </ToolbarButton>
      <ToolbarButton
        active={compose.active_formats.has("orderedList")}
        title={t("mail.numbered_list")}
        onClick={() => editor?.toggle_ordered_list()}
      >
        <ComposeIcon name="numbered_list" />
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
        <ComposeIcon name="remove_formatting" />
      </ToolbarButton>
    </>
  );
}
