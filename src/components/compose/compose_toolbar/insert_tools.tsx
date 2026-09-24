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

import type { ComposeToolbarState } from "@/components/compose/compose_shared";

import { useCallback, useId, useRef, useState } from "react";
import { ComposeIcon, EmojiPopover } from "@aster/ui";

import { LinkPopover } from "./link_popover";
import { ToolbarButton, use_frozen_selection } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { use_emoji_picker_labels } from "@/components/compose/emoji_picker";

export function InsertTools({ compose }: { compose: ComposeToolbarState }) {
  const { t } = use_i18n();
  const editor = compose.editor;
  const { freeze_selection, apply_with_frozen_selection } =
    use_frozen_selection(editor);
  const emoji_labels = use_emoji_picker_labels();
  const reduce_motion = use_should_reduce_motion();

  const [show_link_dialog, set_show_link_dialog] = useState(false);
  const [selected_text_for_link, set_selected_text_for_link] = useState("");
  const link_btn_ref = useRef<HTMLButtonElement>(null);
  const [show_emoji, set_show_emoji] = useState(false);
  const emoji_btn_ref = useRef<HTMLButtonElement>(null);
  const emoji_panel_id = useId();

  const close_emoji = useCallback(() => set_show_emoji(false), []);

  const handle_open_link_dialog = () => {
    freeze_selection();
    editor?.save_selection();
    set_selected_text_for_link(window.getSelection()?.toString() || "");
    set_show_link_dialog(true);
  };

  return (
    <>
      <ToolbarButton
        title={t("mail.attach_file")}
        onClick={compose.trigger_file_select}
      >
        <ComposeIcon name="attach" />
      </ToolbarButton>

      {editor && !compose.is_plain_text_mode && (
        <div>
          <ToolbarButton
            ref={link_btn_ref}
            active={show_link_dialog}
            title={t("mail.insert_link")}
            onClick={handle_open_link_dialog}
          >
            <ComposeIcon name="link" />
          </ToolbarButton>
          <LinkPopover
            anchor_ref={link_btn_ref}
            on_close={() => set_show_link_dialog(false)}
            on_insert={(url, text) =>
              apply_with_frozen_selection(() => editor.insert_link(url, text))
            }
            open={show_link_dialog}
            selected_text={selected_text_for_link}
          />
        </div>
      )}

      {editor && (
        <div>
          <ToolbarButton
            ref={emoji_btn_ref}
            active={show_emoji}
            aria-controls={show_emoji ? emoji_panel_id : undefined}
            aria-expanded={show_emoji}
            aria-haspopup="dialog"
            title={t("common.emoji")}
            onClick={() => {
              if (!show_emoji) freeze_selection();
              set_show_emoji(!show_emoji);
            }}
          >
            <ComposeIcon name="emoji" />
          </ToolbarButton>
          <EmojiPopover
            anchor_ref={emoji_btn_ref}
            labels={emoji_labels}
            open={show_emoji}
            panel_id={emoji_panel_id}
            reduce_motion={reduce_motion}
            on_close={close_emoji}
            on_select={(emoji) => {
              apply_with_frozen_selection(() => editor.insert_emoji(emoji));
              set_show_emoji(false);
            }}
          />
        </div>
      )}
    </>
  );
}
