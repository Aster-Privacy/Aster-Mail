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
import type { TranslationKey } from "@/lib/i18n/types";

import { useMemo } from "react";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

type TFunc = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

interface TrackingProtectionShieldProps {
  tracking_report: ExternalContentReport;
  t: TFunc;
}

const extract_domain = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export function TrackingProtectionShield({
  tracking_report,
  t,
}: TrackingProtectionShieldProps) {
  const spy_pixels = useMemo(
    () =>
      tracking_report.blocked_items.filter(
        (item) => item.type === "tracking_pixel",
      ),
    [tracking_report.blocked_items],
  );

  const pixel_domains = useMemo(() => {
    const domains = new Map<string, number>();

    for (const pixel of spy_pixels) {
      const domain = extract_domain(pixel.url);

      domains.set(domain, (domains.get(domain) || 0) + 1);
    }

    return domains;
  }, [spy_pixels]);

  const param_summary = useMemo(() => {
    const counts = new Map<string, number>();

    for (const link of tracking_report.cleaned_links) {
      for (const param of link.params_removed) {
        counts.set(param, (counts.get(param) || 0) + 1);
      }
    }

    return counts;
  }, [tracking_report.cleaned_links]);

  const total_tracker_count =
    spy_pixels.length + tracking_report.cleaned_links.length;
  const has_trackers = total_tracker_count > 0;

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center rounded p-0.5 transition-colors hover:text-txt-secondary"
          type="button"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <ShieldCheckIcon
            className={`w-4 h-4 ${has_trackers ? "text-blue-500" : "text-txt-muted"}`}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-72 p-3 text-xs space-y-2 bg-surf-primary border-edge-primary"
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 pb-1">
          <ShieldCheckIcon
            className={`w-4 h-4 flex-shrink-0 ${has_trackers ? "text-blue-500" : "text-txt-muted"}`}
          />
          <span className="font-medium text-txt-primary">
            {t("mail.tracking_protection")}
          </span>
        </div>

        {!has_trackers ? (
          <div className="text-txt-muted">{t("mail.no_trackers_detected")}</div>
        ) : (
          <div className="space-y-2">
            {spy_pixels.length > 0 && (
              <div>
                <div className="font-medium text-txt-muted mb-1">
                  {t("mail.spy_pixels_blocked")}
                </div>
                {Array.from(pixel_domains.entries()).map(([domain, count]) => (
                  <div
                    key={domain}
                    className="flex items-center justify-between py-0.5"
                  >
                    <span className="text-txt-secondary font-mono truncate mr-2">
                      {domain}
                    </span>
                    {count > 1 && (
                      <span className="text-txt-muted flex-shrink-0">
                        x{count}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tracking_report.cleaned_links.length > 0 && (
              <div>
                {spy_pixels.length > 0 && (
                  <div className="border-t border-edge-secondary -mx-3 mb-2" />
                )}
                <div className="font-medium text-txt-muted mb-1">
                  {t("mail.links_cleaned")}
                </div>
                {Array.from(param_summary.entries()).map(([param, count]) => (
                  <div key={param} className="text-txt-secondary py-0.5">
                    {t("mail.param_removed_from_n_links", { param, count })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
