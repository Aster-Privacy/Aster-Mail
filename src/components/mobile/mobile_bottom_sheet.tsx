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
import { MobileBottomSheet as MobileBottomSheetView } from "@aster/ui";

import { use_platform } from "@/hooks/use_platform";
import { use_should_reduce_motion } from "@/provider";

interface MobileBottomSheetProps {
  is_open: boolean;
  on_close: () => void;
  children: ReactNode;
  aria_label?: string;
}

export const MobileBottomSheet = memo(function MobileBottomSheet({
  is_open,
  on_close,
  children,
  aria_label,
}: MobileBottomSheetProps) {
  const { safe_area_insets } = use_platform();
  const reduce_motion = use_should_reduce_motion();

  return (
    <MobileBottomSheetView
      aria_label={aria_label}
      is_open={is_open}
      reduce_motion={reduce_motion}
      safe_area_bottom={safe_area_insets.bottom}
      on_close={on_close}
    >
      {children}
    </MobileBottomSheetView>
  );
});
