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
import { memo, useMemo } from "react";
import { StorageMeterView } from "@aster/ui";

import { format_bytes, format_decimal } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

const SCROLL_LAYOUT_TOLERANCE_PX = 24;

export function scroll_to_storage_addons() {
  const prefers_reduced_motion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = prefers_reduced_motion ? "auto" : "smooth";

  let attempts = 0;
  let stable_checks = 0;
  let last_offset: number | null = null;

  const scroll = () => {
    const el = document.getElementById("additional_storage_section");

    if (!el) {
      attempts += 1;
      if (attempts < 60) setTimeout(scroll, 50);

      return;
    }

    if (last_offset === null) {
      window.dispatchEvent(new Event("aster:open-storage-addons"));
    }

    const offset = el.offsetTop;
    const moved =
      last_offset === null ||
      Math.abs(offset - last_offset) > SCROLL_LAYOUT_TOLERANCE_PX;

    if (moved) {
      el.scrollIntoView({ behavior, block: "center" });
      last_offset = offset;
      stable_checks = 0;
    } else {
      stable_checks += 1;
    }

    if (stable_checks < 3) setTimeout(scroll, 240);
  };

  setTimeout(scroll, 60);
}

interface StorageMeterProps {
  storage_percentage: number;
  storage_used_bytes: number;
  storage_total_bytes: number;
  on_buy_more?: () => void;
  on_open?: () => void;
  className?: string;
}

export const StorageMeter = memo(function StorageMeter({
  storage_percentage,
  storage_used_bytes,
  storage_total_bytes,
  on_buy_more,
  on_open,
  className = "",
}: StorageMeterProps) {
  const { t } = use_i18n();
  const labels = useMemo(
    () => ({
      storage_used: t("common.storage_used"),
      under_one_percent: t("common.storage_under_one_percent"),
      of: t("common.of"),
      open: t("settings.storage"),
      buy_more: t("common.buy_more_storage"),
    }),
    [t],
  );

  return (
    <StorageMeterView
      className={className}
      is_loading={storage_total_bytes <= 0}
      labels={labels}
      percent_text={`${format_decimal(storage_percentage, 0)}%`}
      storage_percentage={storage_percentage}
      total_text={format_bytes(storage_total_bytes)}
      used_text={format_bytes(storage_used_bytes)}
      on_buy_more={on_buy_more}
      on_open={on_open}
    />
  );
});
