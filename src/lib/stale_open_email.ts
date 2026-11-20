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
import type { ApiResponse } from "@/services/api/client/helpers";

const MISSING_ITEM_STATUSES = new Set([404, 410]);

export function is_missing_mail_item(
  response: Pick<ApiResponse<unknown>, "code" | "status">,
): boolean {
  if (response.code === "NOT_FOUND") return true;

  return (
    typeof response.status === "number" &&
    MISSING_ITEM_STATUSES.has(response.status)
  );
}

export type WelcomeAutoOpen =
  | { kind: "wait" }
  | { kind: "open"; email_id: string }
  | { kind: "none" };

export function resolve_welcome_auto_open(
  subject_map: Record<string, string>,
): WelcomeAutoOpen {
  const entries = Object.entries(subject_map);

  if (entries.length === 0) return { kind: "wait" };

  const welcome_entry = entries.find(([, subject]) =>
    subject.toLowerCase().includes("welcome to aster"),
  );

  if (!welcome_entry) return { kind: "none" };

  return { kind: "open", email_id: welcome_entry[0] };
}
