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
import { CheckIcon } from "@heroicons/react/24/outline";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown_menu";
import { Input } from "@/components/ui/input";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { Action, CategoryValue } from "@/services/api/mail_rules";

interface BaseProps {
  trigger: React.ReactNode;
  open: boolean;
  on_open_change: (open: boolean) => void;
  align_offset?: number;
}

interface FolderPickerProps extends BaseProps {
  action_type: "move_to";
  value: string | null;
  on_commit: (action: Extract<Action, { type: "move_to" }>) => void;
}

interface LabelPickerProps extends BaseProps {
  action_type: "apply_labels";
  value: string[];
  on_commit: (action: Extract<Action, { type: "apply_labels" }>) => void;
}

interface ReadStatePickerProps extends BaseProps {
  action_type: "mark_as";
  value: "read" | "unread";
  on_commit: (action: Extract<Action, { type: "mark_as" }>) => void;
}

interface ForwardPickerProps extends BaseProps {
  action_type: "forward";
  value: string;
  on_commit: (action: Extract<Action, { type: "forward" }>) => void;
}

interface AutoReplyPickerProps extends BaseProps {
  action_type: "auto_reply";
  value: string;
  on_commit: (action: Extract<Action, { type: "auto_reply" }>) => void;
}

interface SnoozePickerProps extends BaseProps {
  action_type: "snooze";
  value: string;
  on_commit: (action: Extract<Action, { type: "snooze" }>) => void;
}

interface CategorizePickerProps extends BaseProps {
  action_type: "categorize";
  value: CategoryValue;
  on_commit: (action: Extract<Action, { type: "categorize" }>) => void;
}

interface NotifyPickerProps extends BaseProps {
  action_type: "notify";
  value: boolean;
  on_commit: (action: Extract<Action, { type: "notify" }>) => void;
}

type ActionTargetDropdownProps =
  | FolderPickerProps
  | LabelPickerProps
  | ReadStatePickerProps
  | ForwardPickerProps
  | AutoReplyPickerProps
  | SnoozePickerProps
  | CategorizePickerProps
  | NotifyPickerProps;

const CATEGORIES: { key: CategoryValue; label_key: string }[] = [
  { key: "primary", label_key: "mail_rules.category_primary" },
  { key: "important", label_key: "mail_rules.category_important" },
  { key: "promotions", label_key: "mail_rules.category_promotions" },
  { key: "social", label_key: "mail_rules.category_social" },
  { key: "updates", label_key: "mail_rules.category_updates" },
  { key: "forums", label_key: "mail_rules.category_forums" },
];

function add_hours_iso(hours: number): string {
  const d = new Date();

  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function add_days_iso(days: number): string {
  const d = new Date();

  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function ActionTargetDropdown(props: ActionTargetDropdownProps) {
  const { trigger, open, on_open_change, align_offset } = props;
  const { t } = use_i18n();
  const { state: folders_state, fetch_folders } = use_folders();
  const { state: tags_state, fetch_tags } = use_tags();

  const folder_options = folders_state.folders.filter((f) => !f.is_system);
  const label_options = tags_state.tags;

  void cn;

  React.useEffect(() => {
    if (
      props.action_type === "apply_labels" &&
      tags_state.tags.length === 0 &&
      !tags_state.is_loading
    ) {
      fetch_tags();
    }
    if (
      props.action_type === "move_to" &&
      folders_state.folders.length === 0 &&
      !folders_state.is_loading
    ) {
      fetch_folders();
    }
  }, [
    props.action_type,
    tags_state.tags.length,
    tags_state.is_loading,
    folders_state.folders.length,
    folders_state.is_loading,
    fetch_tags,
    fetch_folders,
  ]);

  if (props.action_type === "move_to") {
    return (
      <DropdownMenu open={open} onOpenChange={on_open_change}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          alignOffset={align_offset}
          className="z-[200] w-60 max-h-72"
        >
          <DropdownMenuItem
            onSelect={() =>
              props.on_commit({ type: "move_to", folder_token: null })
            }
            className="justify-between text-[12.5px]"
          >
            <span>{t("mail_rules.none")}</span>
            {props.value === null && <CheckIcon className="w-3.5 h-3.5" />}
          </DropdownMenuItem>
          {folder_options.map((folder) => (
            <DropdownMenuItem
              key={folder.folder_token}
              onSelect={() =>
                props.on_commit({
                  type: "move_to",
                  folder_token: folder.folder_token,
                })
              }
              className="justify-between text-[12.5px]"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: folder.color || "#a3a3a3" }}
                />
                <span className="truncate">{folder.name}</span>
              </span>
              {props.value === folder.folder_token && (
                <CheckIcon className="w-3.5 h-3.5" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (props.action_type === "apply_labels") {
    const labels_props = props;

    return (
      <DropdownMenu open={open} onOpenChange={on_open_change}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          alignOffset={align_offset}
          className="z-[200] w-60 max-h-72"
        >
          {label_options.length === 0 && tags_state.is_loading && (
            <DropdownMenuItem
              disabled
              className="justify-center text-[12.5px] text-neutral-500"
            >
              {t("common.loading")}
            </DropdownMenuItem>
          )}
          {label_options.length === 0 && !tags_state.is_loading && (
            <DropdownMenuItem
              disabled
              className="justify-center text-[12.5px] text-neutral-500"
            >
              {t("mail_rules.no_labels_create_hint")}
            </DropdownMenuItem>
          )}
          {label_options.map((label) => {
            const is_selected = labels_props.value.includes(label.tag_token);

            return (
              <DropdownMenuItem
                key={label.tag_token}
                onSelect={(e) => {
                  e.preventDefault();
                  const next = is_selected
                    ? labels_props.value.filter(
                        (tok) => tok !== label.tag_token,
                      )
                    : [...labels_props.value, label.tag_token];

                  labels_props.on_commit({
                    type: "apply_labels",
                    label_tokens: next,
                  });
                }}
                className="justify-between text-[12.5px]"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: label.color || "#a3a3a3" }}
                  />
                  <span className="truncate">{label.name}</span>
                </span>
                {is_selected && <CheckIcon className="w-3.5 h-3.5" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (props.action_type === "mark_as") {
    return (
      <DropdownMenu open={open} onOpenChange={on_open_change}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          alignOffset={align_offset}
          className="z-[200] w-40"
        >
          <DropdownMenuItem
            onSelect={() =>
              props.on_commit({ type: "mark_as", state: "read" })
            }
            className="justify-between text-[12.5px]"
          >
            <span>{t("mail_rules.read")}</span>
            {props.value === "read" && <CheckIcon className="w-3.5 h-3.5" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              props.on_commit({ type: "mark_as", state: "unread" })
            }
            className="justify-between text-[12.5px]"
          >
            <span>{t("mail_rules.unread")}</span>
            {props.value === "unread" && (
              <CheckIcon className="w-3.5 h-3.5" />
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (props.action_type === "categorize") {
    return (
      <DropdownMenu open={open} onOpenChange={on_open_change}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          alignOffset={align_offset}
          className="z-[200] w-48"
        >
          {CATEGORIES.map((c) => (
            <DropdownMenuItem
              key={c.key}
              onSelect={() =>
                props.on_commit({ type: "categorize", category: c.key })
              }
              className="justify-between text-[12.5px]"
            >
              <span>{t(c.label_key as "mail_rules.category_primary")}</span>
              {props.value === c.key && <CheckIcon className="w-3.5 h-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (props.action_type === "notify") {
    return (
      <DropdownMenu open={open} onOpenChange={on_open_change}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          alignOffset={align_offset}
          className="z-[200] w-40"
        >
          <DropdownMenuItem
            onSelect={() =>
              props.on_commit({ type: "notify", enabled: true })
            }
            className="justify-between text-[12.5px]"
          >
            <span>{t("mail_rules.notify_on")}</span>
            {props.value === true && <CheckIcon className="w-3.5 h-3.5" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              props.on_commit({ type: "notify", enabled: false })
            }
            className="justify-between text-[12.5px]"
          >
            <span>{t("mail_rules.notify_off")}</span>
            {props.value === false && <CheckIcon className="w-3.5 h-3.5" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Popover open={open} onOpenChange={on_open_change}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
          alignOffset={align_offset}
        className="z-[200] w-60 p-1 bg-[var(--dropdown-bg)] border border-[var(--border-secondary)] rounded-md shadow-md"
      >
        {props.action_type === "forward" && (
          <ForwardInput value={props.value} on_commit={props.on_commit} />
        )}

        {props.action_type === "auto_reply" && (
          <div className="p-1.5">
            <div className="text-[11.5px] text-neutral-500 mb-1">
              {t("mail_rules.template_placeholder")}
            </div>
            <button
              type="button"
              disabled
              className="w-full text-left px-2.5 py-1.5 rounded-[12px] text-[12.5px] text-neutral-400 cursor-not-allowed"
            >
              {t("mail_rules.coming_soon")}
            </button>
          </div>
        )}

        {props.action_type === "snooze" && (
          <SnoozePicker value={props.value} on_commit={props.on_commit} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function ForwardInput({
  value,
  on_commit,
}: {
  value: string;
  on_commit: (a: Extract<Action, { type: "forward" }>) => void;
}) {
  const { t } = use_i18n();
  const [draft, set_draft] = React.useState(value);

  React.useEffect(() => set_draft(value), [value]);

  return (
    <div className="p-1.5 w-56">
      <Input
        autoFocus
        size="sm"
        value={draft}
        type="email"
        placeholder={t("mail_rules.forward_to_placeholder")}
        onChange={(e) => set_draft(e.target.value)}
        onBlur={() => {
          if (draft !== value) on_commit({ type: "forward", to: draft });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            on_commit({ type: "forward", to: draft });
          }
        }}
      />
    </div>
  );
}

function SnoozePicker({
  value,
  on_commit,
}: {
  value: string;
  on_commit: (a: Extract<Action, { type: "snooze" }>) => void;
}) {
  const { t } = use_i18n();
  const options: { key: string; label_key: string; iso: () => string }[] = [
    {
      key: "1h",
      label_key: "mail_rules.snooze_1_hour",
      iso: () => add_hours_iso(1),
    },
    {
      key: "1d",
      label_key: "mail_rules.snooze_1_day",
      iso: () => add_days_iso(1),
    },
    {
      key: "3d",
      label_key: "mail_rules.snooze_3_days",
      iso: () => add_days_iso(3),
    },
    {
      key: "1w",
      label_key: "mail_rules.snooze_1_week",
      iso: () => add_days_iso(7),
    },
  ];
  const [custom_draft, set_custom_draft] = React.useState("");

  return (
    <>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() =>
            on_commit({ type: "snooze", until_iso8601: o.iso() })
          }
          className="w-full flex items-center px-2.5 py-1.5 rounded-sm text-[12.5px] hover:bg-[var(--dropdown-hover)] text-left transition-colors"
        >
          {t(o.label_key as "mail_rules.snooze_1_hour")}
        </button>
      ))}
      <div className="px-1.5 pt-1.5 mt-1 border-t border-neutral-100 dark:border-neutral-800">
        <div className="text-[11px] text-neutral-500 px-1 mb-1">
          {t("mail_rules.snooze_custom")}
        </div>
        <Input
          size="sm"
          type="datetime-local"
          value={custom_draft}
          onChange={(e) => {
            set_custom_draft(e.target.value);
            if (e.target.value) {
              const iso = new Date(e.target.value).toISOString();

              on_commit({ type: "snooze", until_iso8601: iso });
            }
          }}
        />
      </div>
      {value && (
        <div className="px-2.5 py-1 text-[11px] text-neutral-500">
          {new Date(value).toLocaleString()}
        </div>
      )}
    </>
  );
}
