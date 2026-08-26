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

import { useState } from "react";
import { Button } from "@aster/ui";

import { DraftStatusIndicator } from "./draft_status";
import { FormatTools } from "./format_tools";
import { InsertTools } from "./insert_tools";
import {
  ToolbarButton,
  read_format_bar_preference,
  store_format_bar_preference,
} from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";

export interface ComposeToolbarProps {
  compose: ComposeToolbarState;
  reduce_motion: boolean;
  show_expiration?: boolean;
  extra_toolbar_items?: React.ReactNode;
}

export function ComposeToolbar({
  compose,
  reduce_motion,
  show_expiration = false,
  extra_toolbar_items,
}: ComposeToolbarProps) {
  const { t } = use_i18n();
  const [show_format_bar, set_show_format_bar] = useState(
    read_format_bar_preference,
  );

  const toggle_format_bar = () => {
    set_show_format_bar((open) => {
      store_format_bar_preference(!open);

      return !open;
    });
  };

  return (
    <div className="relative flex-shrink-0">
      {show_format_bar && (
        <div
          aria-label={t("mail.text_formatting")}
          className="px-3 pt-1.5 flex items-center gap-0.5 overflow-x-auto scrollbar-hide"
          role="toolbar"
        >
          <FormatTools compose={compose} />
        </div>
      )}

      <div className="px-4 pt-1 pb-2.5 flex items-center gap-2">
        {compose.scheduled_time ? (
          <Button
            className="h-9 px-5 rounded-full"
            disabled={!compose.has_recipients || compose.is_scheduling}
            size="md"
            variant="depth"
            onClick={compose.handle_scheduled_send}
          >
            {compose.is_scheduling ? t("mail.scheduling") : t("mail.schedule")}
          </Button>
        ) : (
          <Button
            className="h-9 px-6 rounded-full"
            disabled={!compose.has_recipients || compose.is_sending}
            size="md"
            title={compose.is_mac ? "⌘+Enter" : "Ctrl+Enter"}
            variant="depth"
            onClick={compose.handle_send}
          >
            {compose.is_sending ? <Spinner size="sm" /> : t("mail.send")}
          </Button>
        )}

        <div className="flex items-center gap-1 ms-1">
          <ToolbarButton
            active={show_format_bar}
            title={t("mail.text_formatting")}
            onClick={toggle_format_bar}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 17v2h14v-2H5zm4.5-4.2h5l.9 2.2h2.1L12.75 4h-1.5L6.5 15h2.1l.9-2.2zm2.5-6.13L13.87 11h-3.74L12 6.67z" />
            </svg>
          </ToolbarButton>

          <InsertTools compose={compose} />

          {compose.schedule_picker_element}

          {show_expiration && compose.expiration_picker_element}

          {extra_toolbar_items}

          {compose.template_picker_element}
        </div>

        <div className="ms-auto flex items-center gap-2 min-w-0">
          <DraftStatusIndicator
            compose={compose}
            reduce_motion={reduce_motion}
          />
          {compose.handle_show_delete_confirm && (
            <ToolbarButton
              title={t("common.delete_draft")}
              onClick={compose.handle_show_delete_confirm}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
            </ToolbarButton>
          )}
        </div>
      </div>
    </div>
  );
}
