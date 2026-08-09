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

import {
  useId,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import {  AnimatePresence } from "framer-motion";

import { AttachmentIcon } from "@/components/common/icons";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import EmojiPicker from "@/components/compose/emoji_picker";

import { LinkPopover } from "./link_popover";
import { ToolbarButton, use_anchored_layer, use_frozen_selection } from "./shared";

export function InsertTools({ compose }: { compose: ComposeToolbarState }) {
  const { t } = use_i18n();
  const editor = compose.editor;
  const { freeze_selection, apply_with_frozen_selection } =
    use_frozen_selection(editor);

  const [show_link_dialog, set_show_link_dialog] = useState(false);
  const [selected_text_for_link, set_selected_text_for_link] = useState("");
  const link_btn_ref = useRef<HTMLButtonElement>(null);
  const [show_emoji, set_show_emoji] = useState(false);
  const [emoji_pos, set_emoji_pos] = useState({ top: 0, right: 0 });
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

  use_anchored_layer(
    show_emoji,
    emoji_btn_ref,
    (rect) =>
      set_emoji_pos({
        top: rect.top,
        right: window.innerWidth - rect.right,
      }),
    close_emoji,
  );

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
        <AttachmentIcon className="w-4 h-4" />
      </ToolbarButton>

      {editor && (
        <div>
          <button
            ref={link_btn_ref}
            className={`press_scale w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-full transition-transform duration-150 ${show_link_dialog ? "bg-black/10 text-txt-primary dark:bg-white/10 dark:text-white" : "hover:bg-black/5 dark:hover:bg-white/10 text-txt-tertiary hover:text-txt-primary"}`}
            title={t("mail.insert_link")}
            type="button"
            onClick={handle_open_link_dialog}
            onMouseDown={(e) => e.preventDefault()}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
            </svg>
          </button>
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
          <button
            ref={emoji_btn_ref}
            aria-controls={show_emoji ? emoji_panel_id : undefined}
            aria-expanded={show_emoji}
            aria-haspopup="dialog"
            className={`press_scale w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-full transition-transform duration-150 ${show_emoji ? "bg-black/10 text-txt-primary dark:bg-white/10 dark:text-white" : "hover:bg-black/5 dark:hover:bg-white/10 text-txt-tertiary hover:text-txt-primary"}`}
            title={t("common.emoji")}
            type="button"
            onClick={() => {
              if (!show_emoji) freeze_selection();
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
                  id={emoji_panel_id}
                  style={{
                    zIndex: 9999,
                    right: emoji_pos.right,
                    bottom: window.innerHeight - emoji_pos.top + 8,
                  }}
                >
                  <EmojiPicker
                    on_select={(emoji) => {
                      apply_with_frozen_selection(() =>
                        editor.insert_emoji(emoji),
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
      )}
    </>
  );
}

