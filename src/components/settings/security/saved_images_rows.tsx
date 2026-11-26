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
import { useState, useSyncExternalStore } from "react";
import { Button, IslandRow, SettingToggleRow } from "@aster/ui";

import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import {
  clear_remote_image_cache,
  is_image_cache_enabled,
  is_image_prefetch_enabled,
  set_image_cache_enabled,
  set_image_prefetch_enabled,
  subscribe_image_cache_settings,
} from "@/lib/remote_image_cache";

interface SavedImagesRowsProps {
  images_load_automatically: boolean;
}

export function SavedImagesRows({
  images_load_automatically,
}: SavedImagesRowsProps) {
  const { t } = use_i18n();
  const cache_enabled = useSyncExternalStore(
    subscribe_image_cache_settings,
    is_image_cache_enabled,
    () => true,
  );
  const prefetch_enabled = useSyncExternalStore(
    subscribe_image_cache_settings,
    is_image_prefetch_enabled,
    () => false,
  );
  const [clearing, set_clearing] = useState(false);
  const prefetch_available = cache_enabled && images_load_automatically;

  return (
    <>
      <SettingToggleRow
        checked={cache_enabled}
        description={t("settings.image_cache_description")}
        label={t("settings.image_cache_label")}
        on_change={() => {
          void set_image_cache_enabled(!cache_enabled);
        }}
      />

      <SettingToggleRow
        checked={prefetch_available && prefetch_enabled}
        description={
          prefetch_available
            ? t("settings.image_prefetch_description")
            : t("settings.image_prefetch_unavailable")
        }
        disabled={!prefetch_available}
        label={t("settings.image_prefetch_label")}
        on_change={() => set_image_prefetch_enabled(!prefetch_enabled)}
      />

      <IslandRow
        description={t("settings.image_cache_clear_description")}
        label={t("settings.image_cache_clear_label")}
        trailing={
          <Button
            disabled={clearing}
            size="md"
            variant="secondary"
            onClick={() => {
              set_clearing(true);
              clear_remote_image_cache()
                .then(() => show_toast(t("settings.image_cache_cleared")))
                .catch(() => show_toast(t("common.something_went_wrong"), "error"))
                .finally(() => set_clearing(false));
            }}
          >
            {t("settings.image_cache_clear_button")}
          </Button>
        }
      />
    </>
  );
}
