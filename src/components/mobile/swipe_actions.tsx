import { useState, useRef, useCallback, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import {
  ArchiveBoxIcon,
  TrashIcon,
  ClockIcon,
  StarIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { haptic_swipe_threshold } from "@/native/haptic_feedback";

export interface SwipeAction {
  id: string;
  label: string;
  color: string;
  icon:
    | "archive"
    | "trash"
    | "clock"
    | "star"
    | "envelope"
    | "envelope-open"
    | "spam";
  on_action: () => void;
}

interface SwipeActionsProps {
  children: ReactNode;
  left_actions?: SwipeAction[];
  right_actions?: SwipeAction[];
  disabled?: boolean;
  threshold?: number;
}

const SWIPE_THRESHOLD = 80;
const FULL_SWIPE_THRESHOLD = 160;

const ICONS: Record<
  SwipeAction["icon"],
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  archive: ArchiveBoxIcon,
  trash: TrashIcon,
  clock: ClockIcon,
  star: StarIcon,
  envelope: EnvelopeIcon,
  "envelope-open": EnvelopeOpenIcon,
  spam: ExclamationTriangleIcon,
};

export function SwipeActions({
  children,
  left_actions = [],
  right_actions = [],
  disabled = false,
  threshold = SWIPE_THRESHOLD,
}: SwipeActionsProps) {
  const [is_swiping, set_is_swiping] = useState(false);
  const has_triggered_haptic = useRef(false);
  const container_ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);

  const left_bg_opacity = useTransform(x, [0, threshold], [0, 1]);
  const right_bg_opacity = useTransform(x, [-threshold, 0], [1, 0]);

  const left_icon_scale = useTransform(
    x,
    [0, threshold, FULL_SWIPE_THRESHOLD],
    [0.5, 1, 1.2],
  );
  const right_icon_scale = useTransform(
    x,
    [-FULL_SWIPE_THRESHOLD, -threshold, 0],
    [1.2, 1, 0.5],
  );

  const handle_drag_start = useCallback(() => {
    set_is_swiping(true);
    has_triggered_haptic.current = false;
  }, []);

  const handle_drag = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const current_x = info.offset.x;

      if (!has_triggered_haptic.current && Math.abs(current_x) >= threshold) {
        has_triggered_haptic.current = true;
        haptic_swipe_threshold();
      }
    },
    [threshold],
  );

  const handle_drag_end = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      set_is_swiping(false);

      const offset_x = info.offset.x;
      const velocity_x = info.velocity.x;

      if (offset_x > FULL_SWIPE_THRESHOLD || velocity_x > 500) {
        if (left_actions.length > 0) {
          left_actions[0].on_action();
        }
      } else if (offset_x > threshold && left_actions.length > 0) {
        left_actions[0].on_action();
      } else if (offset_x < -FULL_SWIPE_THRESHOLD || velocity_x < -500) {
        if (right_actions.length > 0) {
          right_actions[0].on_action();
        }
      } else if (offset_x < -threshold && right_actions.length > 0) {
        right_actions[0].on_action();
      }
    },
    [left_actions, right_actions, threshold],
  );

  if (disabled || (left_actions.length === 0 && right_actions.length === 0)) {
    return <>{children}</>;
  }

  return (
    <div ref={container_ref} className="relative overflow-hidden">
      {left_actions.length > 0 && (
        <motion.div
          className="absolute inset-y-0 left-0 flex items-center justify-start px-4"
          style={{
            opacity: left_bg_opacity,
            backgroundColor: left_actions[0]?.color,
            width: "100%",
          }}
        >
          <motion.div
            className="flex flex-col items-center gap-1"
            style={{ scale: left_icon_scale }}
          >
            {left_actions[0] &&
              (() => {
                const Icon = ICONS[left_actions[0].icon];

                return (
                  <>
                    <Icon className="h-6 w-6 text-white" />
                    <span className="text-xs font-medium text-white">
                      {left_actions[0].label}
                    </span>
                  </>
                );
              })()}
          </motion.div>
        </motion.div>
      )}

      {right_actions.length > 0 && (
        <motion.div
          className="absolute inset-y-0 right-0 flex items-center justify-end px-4"
          style={{
            opacity: right_bg_opacity,
            backgroundColor: right_actions[0]?.color,
            width: "100%",
          }}
        >
          <motion.div
            className="flex flex-col items-center gap-1"
            style={{ scale: right_icon_scale }}
          >
            {right_actions[0] &&
              (() => {
                const Icon = ICONS[right_actions[0].icon];

                return (
                  <>
                    <Icon className="h-6 w-6 text-white" />
                    <span className="text-xs font-medium text-white">
                      {right_actions[0].label}
                    </span>
                  </>
                );
              })()}
          </motion.div>
        </motion.div>
      )}

      <motion.div
        dragDirectionLock
        animate={{ x: 0 }}
        className={cn(
          "relative bg-background",
          is_swiping && "cursor-grabbing",
        )}
        drag="x"
        dragConstraints={{ left: -200, right: 200 }}
        dragElastic={0.5}
        style={{ x }}
        transition={{ type: "spring", stiffness: 500, damping: 50 }}
        onDrag={handle_drag}
        onDragEnd={handle_drag_end}
        onDragStart={handle_drag_start}
      >
        {children}
      </motion.div>
    </div>
  );
}
