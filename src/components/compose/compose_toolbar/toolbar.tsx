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
import { Button, ComposeIcon, ComposeToolbarLayout, Tooltip } from "@aster/ui";

import { DraftStatusIndicator } from "./draft_status";
import { FormatTools } from "./format_tools";
import { InsertTools } from "./insert_tools";
import {
  ToolbarButton,
  read_format_bar_preference,
  store_format_bar_preference,
} from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { ButtonSpinner } from "@/components/ui/spinner";

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
    <ComposeToolbarLayout
      end={
        <>
          <DraftStatusIndicator
            compose={compose}
            reduce_motion={reduce_motion}
          />
          {compose.handle_show_delete_confirm && (
            <ToolbarButton
              title={t("common.delete_draft")}
              onClick={compose.handle_show_delete_confirm}
            >
              <ComposeIcon name="trash" />
            </ToolbarButton>
          )}
        </>
      }
      format_bar={
        show_format_bar && !compose.is_plain_text_mode ? (
          <FormatTools compose={compose} />
        ) : null
      }
      format_bar_label={t("mail.text_formatting")}
      primary={
        compose.scheduled_time ? (
          <Button
            className="aster_compose_send"
            disabled={!compose.has_recipients || compose.is_scheduling}
            size="md"
            variant="depth"
            onClick={compose.handle_scheduled_send}
          >
            {compose.is_scheduling ? t("mail.scheduling") : t("mail.schedule")}
          </Button>
        ) : (
          <Tooltip
            position="top"
            tip={compose.is_mac ? "⌘+Enter" : "Ctrl+Enter"}
          >
            <span className="inline-flex flex-shrink-0">
              <Button
                className="aster_compose_send"
                disabled={!compose.has_recipients || compose.is_sending}
                size="md"
                variant="depth"
                onClick={compose.handle_send}
              >
                {t("mail.send")}
                {compose.is_sending && <ButtonSpinner />}
              </Button>
            </span>
          </Tooltip>
        )
      }
      tools={
        <>
          {!compose.is_plain_text_mode && (
            <ToolbarButton
              active={show_format_bar}
              title={t("mail.text_formatting")}
              onClick={toggle_format_bar}
            >
              <ComposeIcon name="formatting" />
            </ToolbarButton>
          )}

          {compose.toggle_plain_text_mode && (
            <ToolbarButton
              active={compose.is_plain_text_mode}
              title={
                compose.is_plain_text_mode
                  ? t("common.switch_to_rich_text")
                  : t("common.switch_to_plain_text")
              }
              onClick={compose.toggle_plain_text_mode}
            >
              <ComposeIcon name="plain_text" />
            </ToolbarButton>
          )}

          <InsertTools compose={compose} />

          {compose.schedule_picker_element}

          {show_expiration && compose.expiration_picker_element}

          {extra_toolbar_items}

          {compose.template_picker_element}
        </>
      }
    />
  );
}
