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
import { memo, type ReactNode } from "react";
import {
  ChevronLeftIcon,
  Bars3Icon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import { use_platform } from "@/hooks/use_platform";
import { use_i18n } from "@/lib/i18n/context";

interface MobileHeaderProps {
  title: string;
  on_back?: () => void;
  on_menu?: () => void;
  on_search?: () => void;
  right_actions?: ReactNode;
}

export const MobileHeader = memo(function MobileHeader({
  title,
  on_back,
  on_menu,
  on_search,
  right_actions,
}: MobileHeaderProps) {
  const { safe_area_insets } = use_platform();
  const { t } = use_i18n();

  return (
    <header
      className="sticky top-0 z-40 shrink-0 bg-[var(--bg-primary)] px-3 relative flex items-center isolate"
      style={{
        paddingTop: safe_area_insets.top,
        height: 56 + safe_area_insets.top,
      }}
    >
      <div className="flex items-center gap-1">
        {on_back && (
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_back}
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        )}

        {on_menu && !on_back && (
          <button
            aria-label={t("common.open_menu_label")}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_menu}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
        )}
      </div>

      <div className="flex-1 min-w-0 flex items-center justify-center px-2">
        {on_menu && !on_back ? (
          <button
            className="max-w-full truncate text-lg font-semibold text-[var(--text-primary)]"
            type="button"
            onClick={on_menu}
          >
            {title}
          </button>
        ) : (
          <h1 className="max-w-full truncate text-lg font-semibold text-[var(--text-primary)]">
            {title}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-1">
        {right_actions}
        {on_search && (
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_search}
          >
            <MagnifyingGlassIcon className="h-6 w-6" />
          </button>
        )}
      </div>
    </header>
  );
});
