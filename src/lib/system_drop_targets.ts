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
  system_move_targets,
  type MailLocation,
} from "@/lib/system_move_targets";

export type SystemDropTarget =
  | "inbox"
  | "archive"
  | "spam"
  | "trash"
  | "starred";

export type SystemDropVerdict = "accept" | "same" | "blocked";

export interface SystemDropSource {
  location?: MailLocation;
  all_starred?: boolean;
}

const SYSTEM_DROP_TARGETS: readonly SystemDropTarget[] = [
  "inbox",
  "archive",
  "spam",
  "trash",
  "starred",
];

const BIN_LOCATIONS: readonly MailLocation[] = ["archive", "spam", "trash"];

export function is_system_drop_target(id: string): id is SystemDropTarget {
  return (SYSTEM_DROP_TARGETS as readonly string[]).includes(id);
}

export function system_drop_verdict(
  target: string,
  source: SystemDropSource | null | undefined,
): SystemDropVerdict {
  if (!is_system_drop_target(target)) return "blocked";

  const location = source?.location;

  if (!location || location === "drafts" || location === "scheduled") {
    return "blocked";
  }

  if (target === "starred") return source.all_starred ? "same" : "accept";
  if (location === target) return "same";
  if (target === "inbox") {
    return BIN_LOCATIONS.includes(location) ? "accept" : "blocked";
  }

  return system_move_targets(location, {
    archive: true,
    spam: true,
    trash: true,
  }).includes(target)
    ? "accept"
    : "blocked";
}
