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
import type { SwipeAction } from "@aster/ui";

import { memo, type ReactNode } from "react";
import { SwipeActions as SwipeActionsView } from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";
import { haptic_swipe_threshold } from "@/native/haptic_feedback";

export type { SwipeAction } from "@aster/ui";

interface SwipeActionsProps {
  left_action?: SwipeAction;
  right_action?: SwipeAction;
  disabled?: boolean;
  children: ReactNode;
}

export const SwipeActions = memo(function SwipeActions({
  left_action,
  right_action,
  disabled,
  children,
}: SwipeActionsProps) {
  const reduce_motion = use_should_reduce_motion();

  return (
    <SwipeActionsView
      disabled={disabled}
      left_action={left_action}
      reduce_motion={reduce_motion}
      right_action={right_action}
      on_threshold_cross={haptic_swipe_threshold}
    >
      {children}
    </SwipeActionsView>
  );
});
