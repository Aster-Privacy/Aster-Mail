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
import type { UserPreferences } from "@/services/api/preferences";

import {
  safe_session_get,
  safe_session_remove,
  safe_session_set,
} from "@/lib/safe_storage";

const ONBOARDING_PREFERENCES_KEY = "aster_onboarding_preferences";

export function queue_onboarding_preference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K],
): void {
  const queued = read_queued();
  queued[key] = value;
  safe_session_set(ONBOARDING_PREFERENCES_KEY, JSON.stringify(queued));
}

export function take_onboarding_preferences(): Partial<UserPreferences> {
  const queued = read_queued();
  safe_session_remove(ONBOARDING_PREFERENCES_KEY);

  return queued;
}

function read_queued(): Partial<UserPreferences> {
  const raw = safe_session_get(ONBOARDING_PREFERENCES_KEY);

  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Partial<UserPreferences>;
    }
  } catch {
    safe_session_remove(ONBOARDING_PREFERENCES_KEY);
  }

  return {};
}
