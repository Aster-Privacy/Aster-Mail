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
    <div className="max-h-[172px] overflow-y-auto pr-1">
      <div className="flex flex-col gap-2">
        {TAG_ICON_GROUPS.map((group) => (
          <div key={group.key}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-txt-muted mb-1">
              {t(group.label_key)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.key === TAG_ICON_GROUPS[0].key && (
                <button
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[11px] transition-colors"
                  style={{
                    backgroundColor: !selected_icon
                      ? "var(--indicator-bg)"
                      : "transparent",
                    border: !selected_icon
                      ? "1px solid var(--border-primary)"
                      : "1px solid transparent",
                    color: "var(--text-muted)",
                  }}
                  title={t("common.no_icon")}
                  type="button"
                  onClick={() => on_select(undefined)}
                >
                  &mdash;
                </button>
              )}
              {group.icons.map((icon_name) => {
                const IconComponent = tag_icon_map[icon_name];
                const is_selected = selected_icon === icon_name;

                return (
                  <button
                    key={icon_name}
                    className="w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors"
                    style={{
                      backgroundColor: is_selected
                        ? "var(--indicator-bg)"
                        : "transparent",
                      border: is_selected
                        ? "1px solid var(--border-primary)"
                        : "1px solid transparent",
                      color: is_selected ? accent_color : "var(--text-muted)",
                    }}
                    title={icon_name}
                    type="button"
                    onClick={() =>
                      on_select(is_selected ? undefined : icon_name)
                    }
                  >
                    {IconComponent && <IconComponent className="w-4 h-4" />}
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
