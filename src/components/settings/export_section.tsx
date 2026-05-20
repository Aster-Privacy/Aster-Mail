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
import { useState } from "react";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { ExportModal } from "./export_modal";

export function ExportSection() {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <ArrowUpTrayIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.export_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm text-txt-muted">
          {t("settings.export_description")}
        </p>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-surf-secondary border-edge-secondary">
        <div className="flex-shrink-0">
          <ArrowUpTrayIcon className="w-6 h-6 text-txt-secondary" />
        </div>
        <span className="flex-1 text-sm font-medium text-txt-primary">
          {t("settings.export_title")}
        </span>
        <Button
          size="md"
          variant="depth"
          onClick={() => set_is_open(true)}
        >
          {t("settings.export_start_button")}
        </Button>
      </div>

      <div className="rounded-xl border p-4 space-y-2 bg-surf-secondary/50 border-edge-secondary">
        <p className="text-xs font-medium text-txt-secondary">
          {t("settings.export_warning_title")}
        </p>
        <p className="text-xs text-txt-muted leading-relaxed">
          {t("settings.export_warning_body")}
        </p>
      </div>

      {is_open && (
        <ExportModal is_open={is_open} on_close={() => set_is_open(false)} />
      )}
    </div>
  );
}
