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

import type { SpamSettings } from "@/services/api/preferences_dev_mode";

export interface spam_settings_apply_options {
  loaded: boolean;
  current: SpamSettings;
  patch: Partial<SpamSettings>;
  load: () => Promise<{ data: SpamSettings | null }>;
  save: (settings: SpamSettings) => Promise<{ data: { success: boolean } }>;
}

export interface spam_settings_apply_result {
  next: SpamSettings;
  loaded: boolean;
  saved: boolean;
}

export async function apply_spam_settings_patch(
  options: spam_settings_apply_options,
): Promise<spam_settings_apply_result> {
  if (options.loaded) {
    const next = { ...options.current, ...options.patch };
    const saved = await save_or_fail(options.save, next);

    return {
      next: saved ? next : options.current,
      loaded: true,
      saved,
    };
  }

  let loaded: SpamSettings | null = null;

  try {
    const result = await options.load();

    loaded = result.data;
  } catch {
    loaded = null;
  }

  if (!loaded) {
    return { next: options.current, loaded: false, saved: false };
  }

  const next = { ...loaded, ...options.patch };
  const saved = await save_or_fail(options.save, next);

  return {
    next: saved ? next : loaded,
    loaded: true,
    saved,
  };
}

async function save_or_fail(
  save: (settings: SpamSettings) => Promise<{ data: { success: boolean } }>,
  settings: SpamSettings,
): Promise<boolean> {
  try {
    const result = await save(settings);

    return result?.data?.success === true;
  } catch {
    return false;
  }
}
