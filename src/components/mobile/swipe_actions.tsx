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
  memo,
  useRef,
  useCallback,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";

import { use_should_reduce_motion } from "@/provider";
import { haptic_swipe_threshold } from "@/native/haptic_feedback";

export interface SwipeAction {
  icon: ReactNode;
  color: string;
  on_trigger: () => void;
}

interface SwipeActionsProps {
  left_action?: SwipeAction;
  right_action?: SwipeAction;
  disabled?: boolean;
  children: ReactNode;
}

const VELOCITY_THRESHOLD = 400;
const ELASTIC_FACTOR = 0.3;
const DEAD_ZONE = 15;
const THRESHOLD_RATIO = 0.35;
const FALLBACK_THRESHOLD = 80;
const MIN_VELOCITY_DISTANCE = 30;

export const SwipeActions = memo(function SwipeActions({
  left_action,
  right_action,
  disabled,
  children,
}: SwipeActionsProps) {
  const reduce_motion = use_should_reduce_motion();
  const x = useMotionValue(0);
  const has_triggered_haptic = useRef(false);
  const container_ref = useRef<HTMLDivElement>(null);
  const [threshold, set_threshold] = useState(FALLBACK_THRESHOLD);

  useLayoutEffect(() => {
    if (!container_ref.current) return;
    const width = container_ref.current.offsetWidth;

    if (width > 0) {
      set_threshold(Math.round(width * THRESHOLD_RATIO));
    }
  }, []);

  const left_opacity = useTransform(x, [-threshold, -DEAD_ZONE, 0], [1, 0, 0]);
  const right_opacity = useTransform(x, [0, DEAD_ZONE, threshold], [0, 0, 1]);

  const handle_drag = useCallback(
    (_: unknown, info: PanInfo) => {
      const offset = info.offset.x;

      if (Math.abs(offset) > threshold && !has_triggered_haptic.current) {
        has_triggered_haptic.current = true;
        haptic_swipe_threshold();
      }
      if (Math.abs(offset) < threshold) {
        has_triggered_haptic.current = false;
      }
    },
    [threshold],
  );

  const handle_drag_end = useCallback(
    (_: unknown, info: PanInfo) => {
      has_triggered_haptic.current = false;

      const offset = info.offset.x;
      const velocity = info.velocity.x;

      const committed_by_distance_right = offset > threshold;
      const committed_by_velocity_right =
        velocity > VELOCITY_THRESHOLD && offset > MIN_VELOCITY_DISTANCE;

      if (
        right_action &&
        offset > 0 &&
        (committed_by_distance_right || committed_by_velocity_right)
      ) {
        right_action.on_trigger();

        return;
      }

      const committed_by_distance_left = offset < -threshold;
      const committed_by_velocity_left =
        velocity < -VELOCITY_THRESHOLD && offset < -MIN_VELOCITY_DISTANCE;

      if (
        left_action &&
        offset < 0 &&
        (committed_by_distance_left || committed_by_velocity_left)
      ) {
        left_action.on_trigger();

        return;
      }
    },
    [left_action, right_action, threshold],
  );

  if (disabled || (!left_action && !right_action)) {
    return <>{children}</>;
  }

  return (
    <div ref={container_ref} className="relative overflow-hidden">
      {right_action && (
        <motion.div
          className="absolute inset-y-0 left-0 flex w-full items-center justify-start pl-6"
          style={{
            opacity: right_opacity,
            backgroundColor: right_action.color,
          }}
        >
          {right_action.icon}
        </motion.div>
      )}

      {left_action && (
        <motion.div
          className="absolute inset-y-0 right-0 flex w-full items-center justify-end pr-6"
          style={{ opacity: left_opacity, backgroundColor: left_action.color }}
        >
          {left_action.icon}
        </motion.div>
      )}

      <motion.div
        dragDirectionLock
        className="relative bg-[var(--bg-primary)]"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={ELASTIC_FACTOR}
        style={{ x }}
        transition={
          reduce_motion
            ? { duration: 0 }
            : { type: "tween", duration: 0.2, ease: "easeOut" }
        }
        onDrag={handle_drag}
        onDragEnd={handle_drag_end}
      >
        {children}
      </motion.div>
    </div>
  );
});
