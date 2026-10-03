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

export interface TrackingPixelDomain {
  domain: string;
  count: number;
}

export interface TrackingPixelSummary {
  count: number;
  domains: TrackingPixelDomain[];
}

export function tracking_pixel_domain(url: string): string | null {
  try {
    const hostname = new URL(url.trim(), "https://invalid.invalid").hostname
      .toLowerCase()
      .replace(/\.$/, "");

    return hostname && hostname !== "invalid.invalid" ? hostname : null;
  } catch {
    return null;
  }
}

export function summarize_tracking_pixels(
  report: Pick<ExternalContentReport, "blocked_items"> | null | undefined,
): TrackingPixelSummary {
  const counts = new Map<string, number>();
  let count = 0;

  for (const item of report?.blocked_items ?? []) {
    if (item.type !== "tracking_pixel") continue;
    count++;
    const domain = tracking_pixel_domain(item.url);

    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  const domains = Array.from(counts, ([domain, total]) => ({
    domain,
    count: total,
  })).sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));

  return { count, domains };
}
