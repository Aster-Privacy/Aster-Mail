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

import { useId, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

import { LinkTool } from "./link_tool";
import {
  ToolbarButton,
  toolbar_button_class,
  use_anchored_layer,
  use_frozen_selection,
} from "./shared";

import { AttachmentIcon } from "@/components/common/icons";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import {
  LazyEmojiPicker,
  preload_emoji_picker,
} from "@/components/compose/lazy_emoji_picker";

const EMOJI_PICKER_WIDTH = 360;
const EMOJI_PICKER_MAX_HEIGHT = 420;
const VIEWPORT_MARGIN = 8;

function clamp_emoji_picker_position(rect: DOMRect) {
  const min_right = VIEWPORT_MARGIN;
  const max_right = Math.max(
    min_right,
    window.innerWidth - EMOJI_PICKER_WIDTH - VIEWPORT_MARGIN,
  );
  const min_bottom = VIEWPORT_MARGIN;
  const max_bottom = Math.max(
    min_bottom,
    window.innerHeight - EMOJI_PICKER_MAX_HEIGHT - VIEWPORT_MARGIN,
  );

  return {
    right: Math.min(
      Math.max(window.innerWidth - rect.right, min_right),
      max_right,
    ),
    bottom: Math.min(
      Math.max(window.innerHeight - rect.top + 8, min_bottom),
      max_bottom,
    ),
  };
}

export function InsertTools({ compose }: { compose: ComposeToolbarState }) {
  const { t } = use_i18n();
  const editor = compose.editor;
  const { freeze_selection, apply_with_frozen_selection } =
    use_frozen_selection(editor);

  const [show_emoji, set_show_emoji] = useState(false);
  const [emoji_pos, set_emoji_pos] = useState({ bottom: 0, right: 0 });
  const emoji_btn_ref = useRef<HTMLButtonElement>(null);
  const emoji_picker_ref = useRef<HTMLDivElement>(null);
  const emoji_panel_id = useId();

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

  const close_emoji = useCallback(() => set_show_emoji(false), []);

  use_escape_layer(show_emoji, close_emoji, "compose_emoji_picker");

  const emoji_visible = use_anchored_layer(
    show_emoji,
    emoji_btn_ref,
    (rect) => set_emoji_pos(clamp_emoji_picker_position(rect)),
    close_emoji,
  );

  return (
    <>
      <ToolbarButton
        title={t("mail.attach_file")}
        onClick={compose.trigger_file_select}
      >
        <AttachmentIcon className="w-4 h-4" />
      </ToolbarButton>

      {editor && !compose.is_plain_text_mode && <LinkTool editor={editor} />}

      {editor && (
        <div>
          <button
            ref={emoji_btn_ref}
            aria-controls={show_emoji ? emoji_panel_id : undefined}
            aria-expanded={show_emoji}
            aria-haspopup="dialog"
            className={toolbar_button_class(show_emoji)}
            title={t("common.emoji")}
            type="button"
            onClick={() => {
              if (!show_emoji) freeze_selection();
              set_show_emoji(!show_emoji);
            }}
            onFocus={preload_emoji_picker}
            onMouseDown={(e) => e.preventDefault()}
            onPointerEnter={preload_emoji_picker}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
            </svg>
          </button>
          {createPortal(
            emoji_visible && (
              <div
                ref={emoji_picker_ref}
                className="aster_floating_anim fixed"
                data-state="open"
                id={emoji_panel_id}
                style={{
                  zIndex: 9999,
                  right: emoji_pos.right,
                  bottom: emoji_pos.bottom,
                  transformOrigin: "center bottom",
                }}
              >
                <LazyEmojiPicker
                  anchor_ref={emoji_btn_ref}
                  on_dismiss={close_emoji}
                  on_select={(emoji) => {
                    apply_with_frozen_selection(() =>
                      editor.insert_emoji(emoji),
                    );
                    set_show_emoji(false);
                  }}
                />
              </div>
            ),
            document.body,
          )}
        </div>
      )}
    </>
  );
}
