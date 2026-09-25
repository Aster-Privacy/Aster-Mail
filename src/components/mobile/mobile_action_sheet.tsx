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
import type { MobileActionSheetItem } from "@aster/ui";

import { memo } from "react";
import { MobileActionSheet as MobileActionSheetView } from "@aster/ui";

import { use_platform } from "@/hooks/use_platform";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface MobileActionSheetProps {
  is_open: boolean;
  on_close: () => void;
  items: MobileActionSheetItem[];
}

export const MobileActionSheet = memo(function MobileActionSheet({
  is_open,
  on_close,
  items,
}: MobileActionSheetProps) {
  const { t } = use_i18n();
  const { safe_area_insets } = use_platform();
  const reduce_motion = use_should_reduce_motion();

  return (
    <MobileActionSheetView
      aria_label={t("common.actions")}
      cancel_label={t("common.cancel")}
      is_open={is_open}
      items={items}
      reduce_motion={reduce_motion}
      safe_area_bottom={safe_area_insets.bottom}
      on_close={on_close}
    />
  );
});
