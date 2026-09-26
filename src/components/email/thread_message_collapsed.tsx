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

import type {
  ThreadMessageBlockProps,
  use_thread_message_block,
} from "./use_thread_message_block";

import {
  StarIcon,
  EyeIcon,
  EyeSlashIcon,
  EllipsisVerticalIcon,
  TrashIcon,
  ArrowUturnRightIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { IslandIconButton, Tooltip } from "@aster/ui";

import { is_system_email, trust_source_for_display } from "@/lib/utils";
import { EmailTag } from "@/components/ui/email_tag";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown_menu";
import { MessageDetailsModal } from "@/components/email/message_details_modal";

export function render_collapsed_thread_message(
  props: ThreadMessageBlockProps,
  state: ReturnType<typeof use_thread_message_block>,
): React.ReactElement {
  const {
    message,
    on_toggle,
    is_starred = false,
    is_read = true,
    on_star_toggle,
    on_toggle_read,
    on_forward,
    on_trash,
    size_bytes,
  } = props;
  const {
    t,
    format_email_detail,
    show_details_modal,
    set_show_details_modal,
    collapsed_preview,
    is_ghost_sender,
    show_sender_name,
    show_sender_email,
    name,
  } = state;

  return (
    <div
      className="group flex cursor-pointer select-none items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--aster-island-hover)]"
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        on_toggle();
      }}
      onKeyDown={(e) => {
        if (e["key"] === "Enter" || e["key"] === " ") {
          e.preventDefault();
          e.stopPropagation();
          on_toggle();
        }
      }}
    >
      <ProfileAvatar
        use_domain_logo
        className="flex-shrink-0"
        email={show_sender_email}
        name={show_sender_name}
        sender_authenticated={is_system_email(
          trust_source_for_display(message, show_sender_email),
        )}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-txt-primary truncate">
            {name}
          </span>
          {is_ghost_sender && (
            <Tooltip tip={t("common.ghost_mode_tooltip")}>
              <EmailTag
                className="flex-shrink-0"
                icon="eye-slash"
                label={t("common.ghost_label")}
                muted={is_read}
                size="sm"
                variant="purple"
              />
            </Tooltip>
          )}
        </div>
        {collapsed_preview && (
          <p className="text-[13px] text-txt-muted truncate mt-0.5">
            {collapsed_preview}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-0.5 -me-2">
        <span className="pe-1.5 text-xs leading-none text-txt-muted whitespace-nowrap">
          {format_email_detail(new Date(message.timestamp))}
        </span>
        <IslandIconButton
          active={is_starred}
          label={is_starred ? t("mail.unstar") : t("mail.star")}
          title={is_starred ? t("mail.unstar") : t("mail.star")}
          onClick={(e) => {
            e.stopPropagation();
            on_star_toggle?.();
          }}
        >
          {is_starred ? (
            <StarIconSolid className="text-amber-400" />
          ) : (
            <StarIcon />
          )}
        </IslandIconButton>
        <span aria-hidden="true" className="h-9 w-9 flex-shrink-0" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IslandIconButton
              label={t("common.more")}
              title={t("common.more")}
              onClick={(e) => e.stopPropagation()}
            >
              <EllipsisVerticalIcon />
            </IslandIconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {on_forward && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  on_toggle();
                  on_forward(message);
                }}
              >
                <ArrowUturnRightIcon className="w-4 h-4 me-2 rtl:-scale-x-100" />
                {t("mail.forward")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {message.item_type !== "sent" && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  on_toggle_read?.();
                }}
              >
                {is_read ? (
                  <EyeSlashIcon className="w-4 h-4 me-2" />
                ) : (
                  <EyeIcon className="w-4 h-4 me-2" />
                )}
                {is_read ? t("mail.mark_unread") : t("mail.mark_read")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                on_star_toggle?.();
              }}
            >
              {is_starred ? (
                <StarIconSolid className="w-4 h-4 me-2 text-amber-400" />
              ) : (
                <StarIcon className="w-4 h-4 me-2" />
              )}
              {is_starred ? t("mail.unstar") : t("mail.star")}
            </DropdownMenuItem>
            {on_trash && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_trash(message);
                  }}
                >
                  <TrashIcon className="w-4 h-4 me-2" />
                  {t("mail.move_to_trash")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MessageDetailsModal
        is_open={show_details_modal}
        message={message}
        on_close={() => set_show_details_modal(false)}
        size_bytes={size_bytes}
      />
    </div>
  );
}
