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

import { use_i18n } from "@/lib/i18n/context";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

interface OfferCountdownProps {
  ends_at: string;
  class_name?: string;
}

export function OfferCountdown({ ends_at, class_name }: OfferCountdownProps) {
  const { t } = use_i18n();
  const [now_ms, set_now_ms] = useState(() => Date.now());
  const ends_ms = Date.parse(ends_at);
  const remaining_ms = Number.isNaN(ends_ms) ? 0 : ends_ms - now_ms;

  useEffect(() => {
    if (remaining_ms <= 0) return;

    const tick_ms = remaining_ms <= HOUR_MS ? SECOND_MS : MINUTE_MS;
    const timer = setTimeout(() => set_now_ms(Date.now()), tick_ms);

    return () => clearTimeout(timer);
  }, [remaining_ms]);

  if (remaining_ms <= 0) return null;

  const days = Math.floor(remaining_ms / DAY_MS);
  const hours = Math.floor((remaining_ms % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((remaining_ms % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((remaining_ms % MINUTE_MS) / SECOND_MS);

  let time: string;

  if (days > 0) {
    time = `${days}${t("common.time_days_short")} ${hours}${t("common.time_hours_short")}`;
  } else if (hours > 0) {
    time = `${hours}${t("common.time_hours_short")} ${minutes}${t("common.time_minutes_short")}`;
  } else {
    time = `${minutes}${t("common.time_minutes_short")} ${seconds}${t("common.time_seconds_short")}`;
  }

  return (
    <span className={class_name} data-testid="offer_countdown">
      {t("settings.special_offer_ends_in", { time })}
    </span>
  );
}
