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
export type MailPriority = "high" | "normal" | "low";

export type OutgoingPriority = Exclude<MailPriority, "normal">;

export interface PriorityHeader {
  name: string;
  value: string;
}

export const MAIL_PRIORITIES: readonly MailPriority[] = [
  "high",
  "normal",
  "low",
];

export function outgoing_priority(
  priority: MailPriority | undefined | null,
): OutgoingPriority | undefined {
  return priority === "high" || priority === "low" ? priority : undefined;
}

export function priority_request_field(
  priority: MailPriority | undefined | null,
): { priority?: OutgoingPriority } {
  const outgoing = outgoing_priority(priority);

  return outgoing ? { priority: outgoing } : {};
}

export function priority_headers(
  priority: MailPriority | undefined | null,
): PriorityHeader[] {
  switch (outgoing_priority(priority)) {
    case "high":
      return [
        { name: "X-Priority", value: "1 (Highest)" },
        { name: "Importance", value: "high" },
      ];
    case "low":
      return [
        { name: "X-Priority", value: "5 (Lowest)" },
        { name: "Importance", value: "low" },
      ];
    default:
      return [];
  }
}

function from_x_priority(value: string): MailPriority | null {
  const match = /^\s*([1-5])\b/.exec(value);

  if (!match) return null;

  const level = Number(match[1]);

  if (level <= 2) return "high";
  if (level >= 4) return "low";

  return "normal";
}

function from_word(value: string): MailPriority | null {
  const word = value.trim().toLowerCase();

  if (word === "high" || word === "urgent") return "high";
  if (word === "low" || word === "non-urgent") return "low";
  if (word === "normal") return "normal";

  return null;
}

export function priority_from_headers(
  headers: ReadonlyArray<PriorityHeader> | undefined | null,
): MailPriority {
  if (!headers || headers.length === 0) return "normal";

  let x_priority: MailPriority | null = null;
  let importance: MailPriority | null = null;
  let priority: MailPriority | null = null;

  for (const header of headers) {
    if (!header || typeof header.name !== "string") continue;

    const name = header.name.trim().toLowerCase();
    const value = typeof header.value === "string" ? header.value : "";

    if (name === "x-priority" && x_priority === null) {
      x_priority = from_x_priority(value);
    } else if (name === "importance" && importance === null) {
      importance = from_word(value);
    } else if (name === "priority" && priority === null) {
      priority = from_word(value);
    }
  }

  return x_priority ?? importance ?? priority ?? "normal";
}
