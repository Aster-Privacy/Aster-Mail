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
import type { CSSProperties } from "react";
import type { TranslationKey } from "@/lib/i18n/types";

import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { Checkbox, Tooltip } from "@aster/ui";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown_menu";
import { use_i18n } from "@/lib/i18n/context";
import { list_select_control_layout } from "@/lib/list_density";

export type SelectByFilterMode =
  "all" | "none" | "read" | "unread" | "starred" | "unstarred";

interface SelectAllControlProps {
  all_selected: boolean;
  some_selected: boolean;
  compact: boolean;
  show_profile_pictures: boolean;
  label?: string;
  on_toggle: () => void;
  on_select_by_filter?: (mode: SelectByFilterMode) => void;
}

const FILTER_ITEMS: {
  mode: SelectByFilterMode;
  label_key: TranslationKey;
  separated?: boolean;
}[] = [
  { mode: "all", label_key: "common.all_short" },
  { mode: "none", label_key: "common.select_none" },
  { mode: "read", label_key: "common.select_read", separated: true },
  { mode: "unread", label_key: "common.select_unread" },
  { mode: "starred", label_key: "common.select_starred" },
  { mode: "unstarred", label_key: "common.select_unstarred" },
];

export function SelectAllControl({
  all_selected,
  some_selected,
  compact,
  show_profile_pictures,
  label,
  on_toggle,
  on_select_by_filter,
}: SelectAllControlProps) {
  const { t } = use_i18n();
  const layout = list_select_control_layout(compact, show_profile_pictures);
  const has_selection = all_selected || some_selected;
  const has_menu = !!on_select_by_filter;
  const show_label = !!label && !has_selection;

  const toggle_style: CSSProperties = {
    paddingInlineStart: layout.inset_px,
    paddingInlineEnd: has_menu ? 0 : layout.inset_px,
  };

  return (
    <div
      className="list_select_control group/select flex h-9 flex-shrink-0 items-center rounded-[10px] transition-colors duration-150 hover:bg-[var(--bg-hover)] has-[[data-state=open]]:bg-[var(--bg-hover)]"
      data-testid="list-select-control"
      style={{ marginInlineStart: -layout.inset_px }}
    >
      <Tooltip
        tip={has_selection ? t("common.deselect_all") : t("common.select_all")}
      >
        <div
          aria-checked={
            all_selected ? "true" : some_selected ? "mixed" : "false"
          }
          aria-label={
            has_selection ? t("common.deselect_all") : t("common.select_all")
          }
          className="list_select_control_toggle flex h-9 flex-shrink-0 cursor-pointer items-center rounded-[10px]"
          data-testid="list-select-toggle"
          role="checkbox"
          style={toggle_style}
          tabIndex={0}
          onClick={() => on_toggle()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              on_toggle();
            }
          }}
        >
          <span
            className="flex h-full flex-shrink-0 items-center justify-center"
            style={{ width: layout.slot_px }}
          >
            <Checkbox
              aria-hidden="true"
              checked={all_selected}
              className="pointer-events-none"
              indeterminate={!all_selected && some_selected}
              readOnly
              tabIndex={-1}
            />
          </span>
          {show_label && (
            <span className="hidden pe-2 text-[13px] text-[var(--text-muted)] sm:inline">
              {label}
            </span>
          )}
        </div>
      </Tooltip>
      {on_select_by_filter && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("common.select_label")}
              className="list_select_control_menu flex h-9 flex-shrink-0 items-center rounded-[10px] ps-0.5 pe-1.5 text-[var(--icon-secondary)] transition-colors duration-150 group-hover/select:text-[var(--icon-active)] focus:outline-none data-[state=open]:text-[var(--icon-active)]"
              data-testid="list-select-menu"
              style={{
                marginInlineStart: show_label ? 0 : layout.menu_offset_px,
              }}
              type="button"
            >
              <ChevronDownIcon className="h-4 w-4 stroke-2 transition-transform duration-150 [[data-state=open]>&]:rotate-180" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-48"
            sideOffset={4}
          >
            <DropdownMenuLabel>{t("common.select_label")}</DropdownMenuLabel>
            {FILTER_ITEMS.map((item) => (
              <SelectFilterItem
                key={item.mode}
                label={t(item.label_key)}
                mode={item.mode}
                on_select={on_select_by_filter}
                separated={item.separated}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function SelectFilterItem({
  mode,
  label,
  separated,
  on_select,
}: {
  mode: SelectByFilterMode;
  label: string;
  separated?: boolean;
  on_select: (mode: SelectByFilterMode) => void;
}) {
  return (
    <>
      {separated && <DropdownMenuSeparator />}
      <DropdownMenuItem
        data-testid={`list-select-${mode}`}
        onClick={() => on_select(mode)}
      >
        {label}
      </DropdownMenuItem>
    </>
  );
}
