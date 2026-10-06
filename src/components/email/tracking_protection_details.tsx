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
import type { ExternalContentReport } from "@/lib/html_sanitizer";
import type { TrackingPixelSummary } from "@/lib/tracking_pixel_summary";

import { ShieldCheckIcon } from "@heroicons/react/24/solid";

import { use_i18n } from "@/lib/i18n/context";
import { summarize_tracking_pixels } from "@/lib/tracking_pixel_summary";
import { TrackingPixelDomainList } from "@/components/email/tracking_pixel_domain_list";

type TrackingReport = Pick<
  ExternalContentReport,
  "blocked_items" | "cleaned_links"
>;

export interface TrackingProtectionSummary {
  spy_pixels: TrackingPixelSummary;
  param_counts: [string, number][];
  cleaned_link_count: number;
  total_count: number;
}

export function summarize_tracking_protection(
  report: TrackingReport,
): TrackingProtectionSummary {
  const spy_pixels = summarize_tracking_pixels({
    blocked_items: report.blocked_items,
  });
  const counts = new Map<string, number>();

  for (const link of report.cleaned_links) {
    for (const param of link.params_removed) {
      counts.set(param, (counts.get(param) || 0) + 1);
    }
  }

  return {
    spy_pixels,
    param_counts: Array.from(counts.entries()),
    cleaned_link_count: report.cleaned_links.length,
    total_count: spy_pixels.count + report.cleaned_links.length,
  };
}

interface TrackingProtectionDetailsProps {
  summary: TrackingProtectionSummary;
  title_id?: string;
  body_class_name?: string;
}

export function TrackingProtectionDetails({
  summary,
  title_id,
  body_class_name = "",
}: TrackingProtectionDetailsProps) {
  const { t } = use_i18n();
  const { spy_pixels, param_counts, cleaned_link_count, total_count } = summary;

  return (
    <div data-testid="tracking-protection-details">
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <ShieldCheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-500 flex-shrink-0" />
        <span
          className="text-[13px] font-semibold text-txt-primary"
          id={title_id}
        >
          {t("mail.tracking_protection")}
        </span>
        <span className="ms-auto text-[11px] font-medium tabular-nums text-txt-muted">
          {t("mail.n_blocked", { count: total_count })}
        </span>
      </div>

      <div className={`px-4 py-3 space-y-3 ${body_class_name}`}>
        {spy_pixels.count > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-txt-muted mb-1.5">
              {t("mail.spy_pixels_blocked")}
            </div>
            <TrackingPixelDomainList summary={spy_pixels} />
          </div>
        )}

        {cleaned_link_count > 0 && (
          <div>
            {spy_pixels.count > 0 && <div className="mb-2" />}
            <div className="text-[11px] font-semibold uppercase tracking-wider text-txt-muted mb-1.5">
              {t("mail.links_cleaned")}
            </div>
            <div className="space-y-0.5">
              {param_counts.map(([param, count]) => (
                <div
                  key={param}
                  className="py-1 px-2 rounded text-[12px] text-txt-secondary"
                >
                  {t("mail.param_removed_from_n_links", { param, count })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
