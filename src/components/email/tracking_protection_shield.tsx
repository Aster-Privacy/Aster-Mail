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
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { useId, useMemo } from "react";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { use_i18n } from "@/lib/i18n/context";
import {
  TrackingProtectionDetails,
  summarize_tracking_protection,
} from "@/components/email/tracking_protection_details";
import { use_preferences } from "@/contexts/preferences_context";

interface TrackingProtectionShieldProps {
  report: ExternalContentReport;
  size?: number;
}

export function TrackingProtectionShield({
  report,
  size = 16,
}: TrackingProtectionShieldProps) {
  const { t, is_rtl } = use_i18n();
  const { preferences } = use_preferences();
  const title_id = useId();
  const summary = useMemo(
    () => summarize_tracking_protection(report),
    [report],
  );
  const { total_count } = summary;

  if (!preferences.block_external_content) return null;
  if (total_count === 0) return null;

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <button
          aria-label={`${t("mail.tracking_protection")}: ${t("mail.n_blocked", { count: total_count })}`}
          className="flex-shrink-0 inline-flex items-center gap-1 transition-colors hover:opacity-80"
          style={{ color: "rgb(16, 185, 129)" }}
          type="button"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <ShieldCheckIcon
            aria-hidden="true"
            className="flex-shrink-0"
            style={{ width: size, height: size, color: "inherit" }}
          />
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: "inherit" }}
          >
            {total_count}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        aria-labelledby={title_id}
        className="w-80 p-0"
        collisionPadding={8}
        side={is_rtl ? "right" : "left"}
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
      >
        <TrackingProtectionDetails
          body_class_name="max-h-64 overflow-y-auto"
          summary={summary}
          title_id={title_id}
        />
      </PopoverContent>
    </Popover>
  );
}
