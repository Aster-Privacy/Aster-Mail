//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { TrackingPixelSummary } from "@/lib/tracking_pixel_summary";

import { use_i18n } from "@/lib/i18n/context";

interface TrackingPixelDomainListProps {
  summary: TrackingPixelSummary;
}

export function TrackingPixelDomainList({
  summary,
}: TrackingPixelDomainListProps) {
  const { t } = use_i18n();

  return (
    <ul className="space-y-0.5" data-testid="tracking-pixel-domains">
      {summary.domains.map(({ domain, count }) => (
        <li
          key={domain}
          className="flex items-center justify-between gap-3 rounded px-2 py-1 text-[12px]"
          data-domain={domain}
        >
          <span
            className="min-w-0 truncate font-mono text-txt-secondary"
            dir="ltr"
            title={domain}
          >
            {domain}
          </span>
          <span
            aria-hidden="true"
            className="flex-shrink-0 text-[11px] tabular-nums text-txt-muted"
            data-testid="tracking-pixel-domain-count"
          >
            x{count}
          </span>
          <span className="sr-only">
            {t("common.tracking_pixels_count", { count })}
          </span>
        </li>
      ))}
    </ul>
  );
}
