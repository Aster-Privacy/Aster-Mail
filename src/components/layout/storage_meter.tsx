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
import { memo } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { format_bytes } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

export function scroll_to_storage_addons() {
  let attempts = 0;
  let settles = 0;
  const scroll = () => {
    const el = document.getElementById("additional_storage_section");

    if (el) {
      el.scrollIntoView({
        behavior: settles === 0 ? "smooth" : "auto",
        block: "center",
      });
      settles += 1;
      if (settles < 8) setTimeout(scroll, 220);

      return;
    }
    attempts += 1;
    if (attempts < 60) setTimeout(scroll, 50);
  };

  setTimeout(scroll, 60);
}

interface StorageMeterProps {
  storage_percentage: number;
  storage_used_bytes: number;
  storage_total_bytes: number;
  on_buy_more?: () => void;
  className?: string;
}

export const StorageMeter = memo(function StorageMeter({
  storage_percentage,
  storage_used_bytes,
  storage_total_bytes,
  on_buy_more,
  className = "",
}: StorageMeterProps) {
  const { t } = use_i18n();

  if (storage_total_bytes <= 0) {
    return (
      <div className={className}>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    );
  }

  const is_critical = storage_percentage >= 90;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium tracking-wide text-txt-muted">
          {t("common.storage_used")}
        </span>
        <span
          className="text-[10px] tabular-nums font-medium"
          style={{
            color: is_critical ? "var(--color-danger)" : "var(--text-tertiary)",
          }}
        >
          {storage_percentage > 0 && storage_percentage < 1
            ? "<1%"
            : `${storage_percentage.toFixed(0)}%`}
        </span>
      </div>
      <div
        aria-label={t("common.storage_used")}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(storage_percentage)}
        className="h-1.5 w-full rounded-full overflow-hidden"
        role="progressbar"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--text-muted) 26%, transparent)",
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            minWidth: "10px",
            width: `${storage_percentage}%`,
            backgroundColor: is_critical
              ? "var(--color-danger)"
              : "var(--accent-color)",
          }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5 gap-2">
        <p className="text-[9px] text-txt-muted truncate">
          {format_bytes(storage_used_bytes)} {t("common.of")}{" "}
          {format_bytes(storage_total_bytes)}
        </p>
        {on_buy_more && (
          <button
            className="text-[9px] flex-shrink-0 text-txt-muted transition-colors hover:text-brand hover:underline focus:outline-none"
            type="button"
            onClick={on_buy_more}
          >
            {t("common.buy_more_storage")}
          </button>
        )}
      </div>
    </div>
  );
});
