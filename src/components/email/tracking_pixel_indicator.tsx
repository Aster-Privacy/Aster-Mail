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

import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { use_i18n } from "@/lib/i18n/context";

interface TrackingPixelDomainListProps {
  summary: TrackingPixelSummary;
}

export function TrackingPixelDomainList({
  summary,
}: TrackingPixelDomainListProps) {
  const { t } = use_i18n();

  return (
    <div className="space-y-0.5" data-testid="tracking-pixel-domains">
      {summary.domains.map(({ domain, count }) => (
        <div
          key={domain}
          className="flex items-center justify-between rounded px-2 py-1 text-[12px]"
          data-domain={domain}
        >
          <span className="me-3 truncate font-mono text-txt-secondary">
            {domain}
          </span>
          {count > 1 && (
            <span
              aria-label={t("common.tracking_pixels_blocked_count", { count })}
              className="flex-shrink-0 text-[11px] tabular-nums text-txt-muted"
              data-testid="tracking-pixel-domain-count"
            >
              x{count}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

interface TrackingPixelIndicatorProps {
  summary: TrackingPixelSummary;
  action?: { label: string; on_select: () => void };
}

export function TrackingPixelIndicator({
  summary,
  action,
}: TrackingPixelIndicatorProps) {
  const { t } = use_i18n();

  if (summary.count === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="group inline-flex flex-shrink-0 items-center gap-1 rounded-[var(--aster-radius-control)] px-1.5 py-0.5 text-xs font-medium text-txt-secondary transition-colors hover:bg-[var(--aster-island-hover)] hover:text-txt-primary data-[state=open]:bg-[var(--aster-island-hover)] data-[state=open]:text-txt-primary"
          data-testid="tracking-pixel-indicator"
          type="button"
          onClick={(e) => e.stopPropagation()}
        >
          <ShieldCheckIcon className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-500" />
          {t("common.tracking_pixels_blocked_count", { count: summary.count })}
          <ChevronDownIcon className="h-3.5 w-3.5 flex-shrink-0 stroke-[2.25] transition-transform duration-150 group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[20rem] max-w-[calc(100vw-2rem)] p-3"
        side="bottom"
        sideOffset={6}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="mb-1.5 flex items-center gap-2 px-2">
          <ShieldCheckIcon className="h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-500" />
          <span className="text-[13px] font-semibold text-txt-primary">
            {t("common.tracking_pixel_domains")}
          </span>
        </div>
        <TrackingPixelDomainList summary={summary} />
        <p className="mt-2 px-2 text-[12px] leading-snug text-txt-muted">
          {t("common.tracking_pixel_domains_hint")}
        </p>
        {action && (
          <div className="mt-3 flex justify-end border-t border-edge-primary px-2 pt-2.5">
            <button
              className="rounded px-1.5 py-0.5 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
              type="button"
              onClick={action.on_select}
            >
              {action.label}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
