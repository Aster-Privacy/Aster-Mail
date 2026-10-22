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

import { CheckIcon } from "@heroicons/react/24/outline";

import { category_icon } from "@/data/category_icons";
import { use_i18n } from "@/lib/i18n/context";
import { MobileBottomSheet } from "@/components/mobile/mobile_bottom_sheet";
import { use_category_tab_options } from "@/components/email/inbox/category_move_menu";

interface MobileCategorySheetProps {
  is_open: boolean;
  current?: EmailCategory | null;
  on_close: () => void;
  on_select: (category: EmailCategory) => void;
}

export function MobileCategorySheet({
  is_open,
  current,
  on_close,
  on_select,
}: MobileCategorySheetProps): React.ReactElement {
  const { t } = use_i18n();
  const options = use_category_tab_options();

  return (
    <MobileBottomSheet
      aria_label={t("mail.move_to_category")}
      is_open={is_open}
      on_close={on_close}
    >
      <div className="px-4 pb-4">
        <h3 className="mb-3 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("mail.move_to_category")}
        </h3>
        <div className="space-y-1">
          {options.map(({ id, icon, label_key, name }) => {
            const Icon = category_icon(icon);

            return (
              <button
                key={id}
                className="flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-start active:bg-[var(--bg-tertiary)]"
                type="button"
                onClick={() => {
                  on_close();
                  on_select(id as EmailCategory);
                }}
              >
                <Icon className="h-5 w-5 text-[var(--text-muted)]" />
                <span className="flex-1 truncate text-[14px] font-medium text-[var(--text-primary)]">
                  {label_key ? t(label_key) : (name ?? id)}
                </span>
                {current === id && (
                  <CheckIcon className="h-5 w-5 text-[var(--text-primary)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </MobileBottomSheet>
  );
}
