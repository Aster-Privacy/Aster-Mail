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
import { useMemo } from "react";
import { SnoozeBadge as SnoozeBadgeView } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

interface SnoozeBadgeProps {
  snoozed_until: string;
  muted?: boolean;
  size?: "xs" | "sm" | "default" | "lg";
  className?: string;
}

export function SnoozeBadge({
  snoozed_until,
  muted = false,
  size = "default",
  className,
}: SnoozeBadgeProps) {
  const { t } = use_i18n();
  const units = useMemo(
    () => ({
      now: t("common.now"),
      days_short: t("common.time_days_short"),
      hours_short: t("common.time_hours_short"),
      minutes_short: t("common.time_minutes_short"),
    }),
    [t],
  );

  return (
    <SnoozeBadgeView
      className={className}
      muted={muted}
      size={size}
      snoozed_until={snoozed_until}
      units={units}
    />
  );
}
