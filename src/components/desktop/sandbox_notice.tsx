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
import { useEffect, useState } from "react";

import { ignore_error } from "@/lib/ignore_error";
import { use_i18n } from "@/lib/i18n/context";
import { is_desktop_runtime } from "@/services/updates/updater";

interface SandboxStatus {
  enabled: boolean;
  reason: string;
}

const OFF_BY_SETTING = new Set(["forced_off", "disabled_by_environment"]);

export function is_sandbox_status(value: unknown): value is SandboxStatus {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.enabled === "boolean" &&
    typeof candidate.reason === "string"
  );
}

export function SandboxNotice() {
  const { t } = use_i18n();
  const [status, set_status] = useState<SandboxStatus | null>(null);

  useEffect(() => {
    if (!is_desktop_runtime()) return;
    let active = true;
    const load = async () => {
      try {
        const core = await import("@tauri-apps/api/core");
        const next = await core.invoke<unknown>("webkit_sandbox_status");

        if (active && is_sandbox_status(next)) set_status(next);
      } catch (caught) {
        ignore_error("components/desktop/sandbox_notice:load", caught);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  if (!status || status.enabled) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[9998] flex justify-center px-4">
      <div
        className="aster_island aster_island_tone_warning pointer-events-auto max-w-xl px-3 py-1.5 text-[12px] font-medium text-txt-primary"
        role="status"
      >
        {t(
          OFF_BY_SETTING.has(status.reason)
            ? "settings.sandbox_off_by_setting_notice"
            : "settings.sandbox_off_notice",
        )}
      </div>
    </div>
  );
}
