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
import type { ComponentType, SVGProps } from "react";

import {
  ArchiveBoxIcon,
  TrashIcon,
  EnvelopeOpenIcon,
  ClockIcon,
  StarIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

export type SwipeActionId =
  | "archive"
  | "delete"
  | "toggle_read"
  | "snooze"
  | "star"
  | "spam"
  | "none";

export interface SwipeActionDefinition {
  id: SwipeActionId;
  label_key: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  color: string;
}

const SWIPE_ACTION_REGISTRY: Record<string, SwipeActionDefinition> = {
  archive: {
    id: "archive",
    label_key: "mail.archive",
    icon: ArchiveBoxIcon,
    color: "#4f6ef7",
  },
  delete: {
    id: "delete",
    label_key: "mail.move_to_trash",
    icon: TrashIcon,
    color: "var(--color-danger)",
  },
  toggle_read: {
    id: "toggle_read",
    label_key: "mail.mark_read",
    icon: EnvelopeOpenIcon,
    color: "#6366f1",
  },
  snooze: {
    id: "snooze",
    label_key: "mail.snooze",
    icon: ClockIcon,
    color: "#d97706",
  },
  star: {
    id: "star",
    label_key: "mail.star",
    icon: StarIcon,
    color: "#eab308",
  },
  spam: {
    id: "spam",
    label_key: "mail.report_spam",
    icon: ExclamationTriangleIcon,
    color: "var(--color-danger)",
  },
};

export function get_swipe_action(id: string): SwipeActionDefinition | null {
  if (id === "none") return null;

  return SWIPE_ACTION_REGISTRY[id] ?? null;
}

export const SWIPE_ACTION_OPTIONS: SwipeActionId[] = [
  "archive",
  "delete",
  "toggle_read",
  "snooze",
  "star",
  "spam",
  "none",
];
