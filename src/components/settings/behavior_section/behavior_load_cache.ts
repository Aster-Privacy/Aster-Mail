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
import type { SpamSettings } from "@/services/api/preferences";
import type { MemberRetentionPolicy } from "@/services/api/family_org";

export const DEFAULT_SPAM_SETTINGS: SpamSettings = {
  spam_retention_days: 30,
  spam_sensitivity: "medium",
  spam_filter_enabled: true,
  trash_retention_days: 30,
};

let cached_spam_settings: SpamSettings | null = null;
let cached_family_policy: { value: MemberRetentionPolicy | null } | null = null;

export function peek_spam_settings(): SpamSettings | null {
  return cached_spam_settings;
}

export function remember_spam_settings(settings: SpamSettings): void {
  cached_spam_settings = settings;
}

export function peek_family_policy(): {
  value: MemberRetentionPolicy | null;
} | null {
  return cached_family_policy;
}

export function remember_family_policy(
  policy: MemberRetentionPolicy | null,
): void {
  cached_family_policy = { value: policy };
}

export function clear_behavior_load_cache(): void {
  cached_spam_settings = null;
  cached_family_policy = null;
}

export function behavior_section_ready(state: {
  spam_settled: boolean;
  family_policy_settled: boolean;
}): boolean {
  return state.spam_settled && state.family_policy_settled;
}
