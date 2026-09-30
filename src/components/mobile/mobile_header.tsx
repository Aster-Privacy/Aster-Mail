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
import { MobileHeader as MobileHeaderView } from "@aster/ui";

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
    <MobileHeaderView
      back_label={t("common.back")}
      menu_label={t("common.open_menu_label")}
      right_actions={right_actions}
      safe_area_top={safe_area_insets.top}
      search_label={t("common.search")}
      title={title}
      on_back={on_back}
      on_menu={on_menu}
      on_search={on_search}
    />
  );
});
