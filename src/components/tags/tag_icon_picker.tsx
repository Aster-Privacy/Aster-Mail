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
import {
  TAG_ICON_GROUPS,
  tag_icon_map,
  tag_icon_label_key,
  type TagIconName,
} from "@/components/ui/email_tag";
import { use_i18n } from "@/lib/i18n/context";

interface TagIconPickerProps {
  selected_icon?: TagIconName;
  accent_color: string;
  on_select: (icon: TagIconName | undefined) => void;
}

export function TagIconPicker({
  selected_icon,
  accent_color,
  on_select,
}: TagIconPickerProps) {
  const { t } = use_i18n();

  return (
    <div className="tag_icon_picker">
      <div className="flex flex-col gap-2.5">
        {TAG_ICON_GROUPS.map((group, group_index) => (
          <div key={group.key}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-txt-muted">
              {t(group.label_key)}
            </div>
            <div className="grid grid-cols-9 gap-1">
              {group_index === 0 && (
                <button
                  aria-pressed={!selected_icon}
                  className="tag_icon_picker_cell"
                  data-selected={!selected_icon}
                  title={t("common.no_icon")}
                  type="button"
                  onClick={() => on_select(undefined)}
                >
                  <span className="text-[13px] leading-none">&mdash;</span>
                </button>
              )}
              {group.icons.map((icon_name) => {
                const IconComponent = tag_icon_map[icon_name];
                const is_selected = selected_icon === icon_name;

                return (
                  <button
                    key={icon_name}
                    aria-pressed={is_selected}
                    className="tag_icon_picker_cell"
                    data-selected={is_selected}
                    style={
                      is_selected
                        ? ({
                            "--tag-icon-accent": accent_color,
                          } as React.CSSProperties)
                        : undefined
                    }
                    title={t(tag_icon_label_key(icon_name))}
                    type="button"
                    onClick={() =>
                      on_select(is_selected ? undefined : icon_name)
                    }
                  >
                    {IconComponent && (
                      <IconComponent className="h-[18px] w-[18px]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
