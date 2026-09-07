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
import { useEffect, useRef } from "react";

import { api_client } from "@/services/api/client";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";

export type StorageFormat = "aster" | "ipfs";

export function use_storage_format() {
  const { preferences, update_preference } = use_preferences();
  const { t } = use_i18n();
  const has_synced = useRef(false);

  useEffect(() => {
    if (has_synced.current) return;

    has_synced.current = true;

    let cancelled = false;

    void (async () => {
      const response = await api_client.get<{
        ipfs_storage_enabled?: boolean;
      }>("/settings/v1/encryption");

      if (cancelled || !response.data) return;

      const server_format: StorageFormat = response.data.ipfs_storage_enabled
        ? "ipfs"
        : "aster";

      update_preference("storage_format", server_format, true);
    })();

    return () => {
      cancelled = true;
    };
  }, [update_preference]);

  const handle_storage_format_change = async (format: StorageFormat) => {
    const previous = preferences.storage_format;

    if (format === previous) return;

    update_preference("storage_format", format, true);

    try {
      const response = await api_client.put<{ success: boolean }>(
        "/settings/v1/encryption",
        { ipfs_storage_enabled: format === "ipfs" },
      );

      if (response.error || response.data?.success !== true) {
        update_preference("storage_format", previous, true);
        show_toast(t("settings.failed_save_setting"), "error");
      }
    } catch {
      update_preference("storage_format", previous, true);
      show_toast(t("settings.failed_save_setting"), "error");
    }
  };

  return {
    storage_format: preferences.storage_format,
    handle_storage_format_change,
  };
}
