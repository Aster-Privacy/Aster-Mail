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
import type { EmailCategory } from "@/types/email";

import { useSyncExternalStore } from "react";
import { CheckIcon, Squares2X2Icon } from "@heroicons/react/24/outline";

import { category_icon } from "@/data/category_icons";
import { displayed_category } from "@/services/effective_category";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_active_tab_options,
  get_version as get_category_index_version,
  subscribe as subscribe_category_index,
} from "@/services/category_index";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown_menu";

interface CategoryMoveDropdownSubProps {
  source?: {
    id?: string;
    thread_token?: string;
    mail_category?: EmailCategory;
  } | null;
  on_select: (category: EmailCategory) => void;
}

export function use_category_tab_options(): ReturnType<
  typeof get_active_tab_options
> {
  useSyncExternalStore(subscribe_category_index, get_category_index_version);

  return get_active_tab_options();
}

export function CategoryMoveDropdownSub({
  source,
  on_select,
}: CategoryMoveDropdownSubProps): React.ReactElement | null {
  const { t } = use_i18n();
  const options = use_category_tab_options();

  if (options.length < 2) return null;

  const current = source ? displayed_category(source) : null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Squares2X2Icon className="w-4 h-4 me-2" />
        {t("mail.move_to_category")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        {options.map(({ id, icon, label_key, name }) => {
          const Icon = category_icon(icon);

          return (
            <DropdownMenuItem
              key={id}
              onSelect={() => on_select(id as EmailCategory)}
            >
              {current === id && (
                <CheckIcon className="me-0.5 h-3 w-3 flex-shrink-0" />
              )}
              <Icon className="me-2 h-4 w-4" />
              <span className="truncate">
                {label_key ? t(label_key) : (name ?? id)}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
