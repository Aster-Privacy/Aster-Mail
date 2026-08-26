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

import type {} from "@/services/api/client";

export const SESSION_TIMEOUT_OPTIONS = [
  { value: 5, label_key: "settings.five_minutes" as const },
  { value: 15, label_key: "settings.fifteen_minutes" as const },
  { value: 30, label_key: "settings.thirty_minutes" as const },
  { value: 60, label_key: "settings.one_hour" as const },
  { value: 120, label_key: "settings.two_hours" as const },
  { value: 240, label_key: "settings.four_hours" as const },
  { value: 480, label_key: "settings.eight_hours" as const },
];

export const KEY_ROTATION_OPTIONS = [
  { value: 24, label_key: "settings.daily" as const },
  { value: 168, label_key: "settings.weekly" as const },
  { value: 336, label_key: "settings.biweekly" as const },
  { value: 720, label_key: "settings.monthly" as const },
];

export const KEY_HISTORY_OPTIONS = [
  { value: 5, label_key: "settings.five_keys" as const },
  { value: 10, label_key: "settings.ten_keys" as const },
  { value: 25, label_key: "settings.twenty_five_keys" as const },
  { value: 0, label_key: "settings.unlimited" as const },
];

export interface LogoutOthersResponse {
  message: string;
  sessions_revoked: number;
}
