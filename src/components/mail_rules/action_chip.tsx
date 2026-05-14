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
import * as React from "react";
import {
  FolderIcon,
  TagIcon,
  EyeIcon,
  StarIcon,
  ArrowRightOnRectangleIcon,
  TrashIcon,
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
  MapPinIcon,
  ClockIcon,
  BellIcon,
  BellSlashIcon,
} from "@heroicons/react/24/outline";

import { ChipPill, ChipSegment } from "./chip_pill";
import { ActionTargetDropdown } from "./dropdowns/action_target_dropdown";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
import { use_i18n } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/types";
import type { Action, CategoryValue } from "@/services/api/mail_rules";

interface ActionChipProps {
  action: Action;
  on_change: (action: Action) => void;
  on_remove: () => void;
  read_only?: boolean;
}

const CATEGORY_LABEL: Record<CategoryValue, TranslationKey> = {
  primary: "mail_rules.category_primary",
  important: "mail_rules.category_important",
  promotions: "mail_rules.category_promotions",
  social: "mail_rules.category_social",
  updates: "mail_rules.category_updates",
  forums: "mail_rules.category_forums",
};

export function ActionChip({
  action,
  on_change,
  on_remove,
  read_only,
}: ActionChipProps) {
  const { t } = use_i18n();
  const { state: folders_state } = use_folders();
  const { state: tags_state } = use_tags();
  const [open, set_open] = React.useState(false);
  const pill_ref = React.useRef<HTMLDivElement | null>(null);
  const trigger_ref = React.useRef<HTMLButtonElement | null>(null);
  const [align_offset, set_align_offset] = React.useState<number>(0);

  React.useLayoutEffect(() => {
    if (!open) return;
    if (!pill_ref.current || !trigger_ref.current) return;
    const pill_left = pill_ref.current.getBoundingClientRect().left;
    const trigger_left = trigger_ref.current.getBoundingClientRect().left;

    set_align_offset(pill_left - trigger_left - 1);
  }, [open]);

  const action_icons: Record<Action["type"], React.ElementType> = {
    move_to: FolderIcon,
    apply_labels: TagIcon,
    mark_as: EyeIcon,
    star: StarIcon,
    skip_inbox: ArrowRightOnRectangleIcon,
    delete: TrashIcon,
    forward: PaperAirplaneIcon,
    auto_reply: ChatBubbleLeftRightIcon,
    pin: MapPinIcon,
    snooze: ClockIcon,
    categorize: TagIcon,
    notify:
      action.type === "notify" && action.enabled === false
        ? BellSlashIcon
        : BellIcon,
  };

  const Icon = action_icons[action.type] ?? TagIcon;

  const label_for_action = (): string => {
    switch (action.type) {
      case "move_to":
        return t("mail_rules.action_move_to");
      case "apply_labels":
        return t("mail_rules.action_apply_labels");
      case "mark_as":
        return t("mail_rules.action_mark_as");
      case "star":
        return t("mail_rules.action_star");
      case "skip_inbox":
        return t("mail_rules.action_skip_inbox");
      case "delete":
        return t("mail_rules.action_delete");
      case "forward":
        return t("mail_rules.action_forward");
      case "auto_reply":
        return t("mail_rules.action_auto_reply");
      case "pin":
        return t("mail_rules.action_pin");
      case "snooze":
        return t("mail_rules.action_snooze");
      case "categorize":
        return t("mail_rules.action_categorize");
      case "notify":
        return t("mail_rules.action_notify");
      default:
        return "";
    }
  };

  const target_label = (): string => {
    switch (action.type) {
      case "move_to": {
        if (!action.folder_token) return t("mail_rules.none");
        const folder = folders_state.folders.find(
          (f) => f.folder_token === action.folder_token,
        );

        return folder?.name ?? t("mail_rules.none");
      }
      case "apply_labels": {
        if (action.label_tokens.length === 0) return t("mail_rules.no_labels");
        const names = action.label_tokens
          .map(
            (tok) =>
              tags_state.tags.find((tag) => tag.tag_token === tok)?.name,
          )
          .filter(Boolean);

        return names.length > 0 ? names.join(", ") : t("mail_rules.no_labels");
      }
      case "mark_as":
        return action.state === "read"
          ? t("mail_rules.read")
          : t("mail_rules.unread");
      case "forward":
        return action.to || t("mail_rules.forward_to_placeholder");
      case "auto_reply":
        return action.template_id || t("mail_rules.template_placeholder");
      case "snooze":
        if (!action.until_iso8601) return t("mail_rules.snooze_custom");
        try {
          return new Date(action.until_iso8601).toLocaleString();
        } catch {
          return action.until_iso8601;
        }
      case "categorize":
        return t(CATEGORY_LABEL[action.category]);
      case "notify":
        return action.enabled
          ? t("mail_rules.notify_on")
          : t("mail_rules.notify_off");
      default:
        return "";
    }
  };

  const is_target_placeholder = (() => {
    switch (action.type) {
      case "move_to":
        return !action.folder_token;
      case "apply_labels":
        return action.label_tokens.length === 0;
      case "forward":
        return !action.to;
      case "auto_reply":
        return !action.template_id;
      case "snooze":
        return !action.until_iso8601;
      default:
        return false;
    }
  })();

  const target_text_class = is_target_placeholder
    ? "text-neutral-400"
    : undefined;

  const action_segment = (
    <ChipSegment
      is_first
      icon={<Icon className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />}
    >
      {label_for_action()}
    </ChipSegment>
  );

  if (action.type === "star" || action.type === "skip_inbox" || action.type === "delete" || action.type === "pin") {
    return (
      <ChipPill on_remove={read_only ? undefined : on_remove}>
        {action_segment}
      </ChipPill>
    );
  }

  const target_color =
    action.type === "move_to" && action.folder_token
      ? folders_state.folders.find(
          (f) => f.folder_token === action.folder_token,
        )?.color
      : undefined;

  return (
    <ChipPill ref={pill_ref} on_remove={read_only ? undefined : on_remove}>
      {action_segment}
      {action.type === "move_to" && (
        <ActionTargetDropdown
          action_type="move_to"
          value={action.folder_token}
          open={open}
          on_open_change={set_open}
          align_offset={align_offset}
          on_commit={(a) => {
            on_change(a);
            set_open(false);
          }}
          trigger={
            <ChipSegment
              trigger_ref={trigger_ref}
              is_active={open}
              on_click={read_only ? undefined : () => set_open(true)}
            >
              <span className={`flex items-center gap-1.5 ${target_text_class ?? ""}`}>
                {target_color && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: target_color }}
                  />
                )}
                {target_label()}
              </span>
            </ChipSegment>
          }
        />
      )}
      {action.type === "apply_labels" && (
        <ActionTargetDropdown
          action_type="apply_labels"
          value={action.label_tokens}
          open={open}
          on_open_change={set_open}
          align_offset={align_offset}
          on_commit={(a) => on_change(a)}
          trigger={
            <ChipSegment
              trigger_ref={trigger_ref}
              is_active={open}
              on_click={read_only ? undefined : () => set_open(true)}
            >
              <span className={target_text_class}>{target_label()}</span>
            </ChipSegment>
          }
        />
      )}
      {action.type === "mark_as" && (
        <ActionTargetDropdown
          action_type="mark_as"
          value={action.state}
          open={open}
          on_open_change={set_open}
          align_offset={align_offset}
          on_commit={(a) => {
            on_change(a);
            set_open(false);
          }}
          trigger={
            <ChipSegment
              trigger_ref={trigger_ref}
              is_active={open}
              on_click={read_only ? undefined : () => set_open(true)}
            >
              <span className={target_text_class}>{target_label()}</span>
            </ChipSegment>
          }
        />
      )}
      {action.type === "forward" && (
        <ActionTargetDropdown
          action_type="forward"
          value={action.to}
          open={open}
          on_open_change={set_open}
          align_offset={align_offset}
          on_commit={(a) => {
            on_change(a);
            set_open(false);
          }}
          trigger={
            <ChipSegment
              trigger_ref={trigger_ref}
              is_active={open}
              on_click={read_only ? undefined : () => set_open(true)}
            >
              <span className={target_text_class}>{target_label()}</span>
            </ChipSegment>
          }
        />
      )}
      {action.type === "auto_reply" && (
        <ActionTargetDropdown
          action_type="auto_reply"
          value={action.template_id}
          open={open}
          on_open_change={set_open}
          align_offset={align_offset}
          on_commit={(a) => {
            on_change(a);
            set_open(false);
          }}
          trigger={
            <ChipSegment
              trigger_ref={trigger_ref}
              is_active={open}
              on_click={read_only ? undefined : () => set_open(true)}
            >
              <span className={target_text_class}>{target_label()}</span>
            </ChipSegment>
          }
        />
      )}
      {action.type === "snooze" && (
        <ActionTargetDropdown
          action_type="snooze"
          value={action.until_iso8601}
          open={open}
          on_open_change={set_open}
          align_offset={align_offset}
          on_commit={(a) => {
            on_change(a);
            set_open(false);
          }}
          trigger={
            <ChipSegment
              trigger_ref={trigger_ref}
              is_active={open}
              on_click={read_only ? undefined : () => set_open(true)}
            >
              <span className={target_text_class}>{target_label()}</span>
            </ChipSegment>
          }
        />
      )}
      {action.type === "categorize" && (
        <ActionTargetDropdown
          action_type="categorize"
          value={action.category}
          open={open}
          on_open_change={set_open}
          align_offset={align_offset}
          on_commit={(a) => {
            on_change(a);
            set_open(false);
          }}
          trigger={
            <ChipSegment
              trigger_ref={trigger_ref}
              is_active={open}
              on_click={read_only ? undefined : () => set_open(true)}
            >
              <span className={target_text_class}>{target_label()}</span>
            </ChipSegment>
          }
        />
      )}
      {action.type === "notify" && (
        <ActionTargetDropdown
          action_type="notify"
          value={action.enabled}
          open={open}
          on_open_change={set_open}
          align_offset={align_offset}
          on_commit={(a) => {
            on_change(a);
            set_open(false);
          }}
          trigger={
            <ChipSegment
              trigger_ref={trigger_ref}
              is_active={open}
              on_click={read_only ? undefined : () => set_open(true)}
            >
              <span className={target_text_class}>{target_label()}</span>
            </ChipSegment>
          }
        />
      )}
    </ChipPill>
  );
}
