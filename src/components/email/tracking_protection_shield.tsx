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

import { useMemo } from "react";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";

const extract_domain = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

interface TrackingProtectionShieldProps {
  report: ExternalContentReport;
  size?: number;
}

export function TrackingProtectionShield({
  report,
  size = 16,
}: TrackingProtectionShieldProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();

  if (!preferences.block_external_content) return null;

  const spy_pixels = useMemo(
    () => report.blocked_items.filter((item) => item.type === "tracking_pixel"),
    [report.blocked_items],
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

    for (const link of report.cleaned_links) {
      for (const param of link.params_removed) {
        counts.set(param, (counts.get(param) || 0) + 1);
      }
    }

    return counts;
  }, [report.cleaned_links]);

  const total_count =
    spy_pixels.length + report.cleaned_links.length;

  if (total_count === 0) return null;

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <button
          className="flex-shrink-0 inline-flex items-center gap-1 transition-colors hover:opacity-80"
          style={{ color: "rgb(16, 185, 129)" }}
          type="button"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <ShieldCheckIcon
            className="flex-shrink-0"
            style={{ width: size, height: size, color: "inherit" }}
          />
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: "inherit" }}>
            {total_count}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-80 p-0 bg-surf-primary border-edge-primary shadow-lg"
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-edge-secondary">
          <ShieldCheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-500 flex-shrink-0" />
          <span className="text-[13px] font-semibold text-txt-primary">
            {t("mail.tracking_protection")}
          </span>
          <span className="ml-auto text-[11px] font-medium tabular-nums text-txt-muted">
            {t("mail.n_blocked", { count: total_count })}
          </span>
        </div>

        <div className="px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
          {spy_pixels.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-txt-muted mb-1.5">
                {t("mail.spy_pixels_blocked")}
              </div>
              <div className="space-y-0.5">
                {Array.from(pixel_domains.entries()).map(([domain, count]) => (
                  <div
                    key={domain}
                    className="flex items-center justify-between py-1 px-2 rounded text-[12px]"
                  >
                    <span className="text-txt-secondary font-mono truncate mr-3">
                      {domain}
                    </span>
                    {count > 1 && (
                      <span className="text-txt-muted flex-shrink-0 tabular-nums text-[11px]">
                        x{count}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.cleaned_links.length > 0 && (
            <div>
              {spy_pixels.length > 0 && (
                <div className="border-t border-edge-secondary -mx-4 mb-3" />
              )}
              <div className="text-[11px] font-semibold uppercase tracking-wider text-txt-muted mb-1.5">
                {t("mail.links_cleaned")}
              </div>
              <div className="space-y-0.5">
                {Array.from(param_summary.entries()).map(([param, count]) => (
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
      </PopoverContent>
    </Popover>
  );
}
