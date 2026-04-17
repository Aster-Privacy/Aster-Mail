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
  ExclamationTriangleIcon,
  ArrowUpCircleIcon,
  CircleStackIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

interface StorageBannerProps {
  storage_used_bytes: number;
  storage_total_bytes: number;
  on_settings_click: () => void;
}

export function StorageBanner({
  storage_used_bytes,
  storage_total_bytes,
  on_settings_click,
}: StorageBannerProps) {
  const { t } = use_i18n();
  const storage_pct =
    storage_total_bytes > 0
      ? (storage_used_bytes / storage_total_bytes) * 100
      : 0;
  const is_storage_locked = storage_pct >= 100;
  const is_storage_warning = storage_pct >= 90 && storage_pct < 100;
  const is_storage_approaching = storage_pct >= 75 && storage_pct < 90;

  if (is_storage_locked) {
    return (
      <div
        className="mx-3 mt-2 px-4 py-3 rounded-lg flex items-center gap-3"
        style={{
          backgroundColor: "#dc2626",
          color: "#fff",
        }}
      >
        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-white" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            {t("settings.storage_locked_title")}
          </p>
          <p className="text-xs text-white/80 mt-0.5">
            {t("settings.storage_locked_description")}
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-white hover:bg-white/90 transition-colors flex-shrink-0"
          onClick={on_settings_click}
        >
          <ArrowUpCircleIcon className="w-3.5 h-3.5" />
          {t("common.upgrade")}
        </button>
      </div>
    );
  }

  if (is_storage_warning) {
    return (
      <div
        className="mx-3 mt-2 px-4 py-3 rounded-lg flex items-center gap-3"
        style={{
          backgroundColor: "#d97706",
          color: "#fff",
        }}
      >
        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-white" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            {t("settings.storage_warning_title")}
          </p>
          <p className="text-xs text-white/80 mt-0.5">
            {t("settings.storage_warning_description")}
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-white hover:bg-white/90 transition-colors flex-shrink-0"
          onClick={on_settings_click}
        >
          <ArrowUpCircleIcon className="w-3.5 h-3.5" />
          {t("common.upgrade")}
        </button>
      </div>
    );
  }

  if (is_storage_approaching) {
    return (
      <div
        className="mx-3 mt-2 px-4 py-3 rounded-lg flex items-center gap-3"
        style={{
          backgroundColor: "#2563eb",
          color: "#fff",
        }}
      >
        <CircleStackIcon className="w-5 h-5 flex-shrink-0 text-white" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            {t("settings.storage_approaching_title")}
          </p>
          <p className="text-xs text-white/80 mt-0.5">
            {t("settings.storage_approaching_description")}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
