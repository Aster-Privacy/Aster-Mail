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
import type { UseEditorReturn } from "@/hooks/use_editor";

import { useRef, useState } from "react";

import { LinkPopover } from "./link_popover";
import { toolbar_button_class, use_frozen_selection } from "./shared";

import { use_i18n } from "@/lib/i18n/context";

export function LinkTool({ editor }: { editor: UseEditorReturn }) {
  const { t } = use_i18n();
  const { freeze_selection, apply_with_frozen_selection } =
    use_frozen_selection(editor);
  const [show_link_dialog, set_show_link_dialog] = useState(false);
  const [selected_text_for_link, set_selected_text_for_link] = useState("");
  const [link_initial_url, set_link_initial_url] = useState("");
  const link_btn_ref = useRef<HTMLButtonElement>(null);

  const handle_open_link_dialog = () => {
    const anchor = editor.get_link_at_selection() ?? null;

    if (anchor) {
      const selection = window.getSelection();

      if (selection?.isCollapsed) {
        const range = document.createRange();

        range.selectNodeContents(anchor);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    freeze_selection();
    editor.save_selection();
    set_link_initial_url(anchor?.getAttribute("href") ?? "");
    set_selected_text_for_link(window.getSelection()?.toString() || "");
    set_show_link_dialog(true);
  };

  return (
    <div>
      <button
        ref={link_btn_ref}
        className={toolbar_button_class(show_link_dialog)}
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
        initial_url={link_initial_url}
        on_close={() => set_show_link_dialog(false)}
        on_insert={(url, text) =>
          apply_with_frozen_selection(() => editor.insert_link(url, text))
        }
        open={show_link_dialog}
        selected_text={selected_text_for_link}
      />
    </div>
  );
}
