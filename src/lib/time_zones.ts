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
export interface TimeZoneOption {
  id: string;
  city: string;
  region: string;
  offset_minutes: number;
  offset_label: string;
  search_text: string;
}

export function get_supported_time_zones(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;

  if (typeof supported !== "function") return [];

  try {
    return supported("timeZone");
  } catch {
    return [];
  }
}

export function get_device_time_zone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function get_time_zone_offset_minutes(zone: string, at = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = formatter.formatToParts(at);
    const lookup: Record<string, string> = {};

    for (const part of parts) lookup[part.type] = part.value;

    const as_utc = Date.UTC(
      Number(lookup.year),
      Number(lookup.month) - 1,
      Number(lookup.day),
      Number(lookup.hour) === 24 ? 0 : Number(lookup.hour),
      Number(lookup.minute),
      Number(lookup.second),
    );

    return Math.round((as_utc - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export function format_offset_label(offset_minutes: number): string {
  const sign = offset_minutes < 0 ? "-" : "+";
  const total = Math.abs(offset_minutes);
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");

  return `GMT${sign}${hours}:${minutes}`;
}

export function get_time_zone_label_parts(zone: string): {
  city: string;
  region: string;
} {
  const segments = zone.split("/");
  const city = (segments[segments.length - 1] ?? zone).replace(/_/g, " ");
  const region = segments
    .slice(0, -1)
    .map((segment) => segment.replace(/_/g, " "))
    .join(" / ");

  return { city, region };
}

export function build_time_zone_options(at = new Date()): TimeZoneOption[] {
  const zones = get_supported_time_zones();

  return zones
    .map((id) => {
      const { city, region } = get_time_zone_label_parts(id);
      const offset_minutes = get_time_zone_offset_minutes(id, at);
      const offset_label = format_offset_label(offset_minutes);

      return {
        id,
        city,
        region,
        offset_minutes,
        offset_label,
        search_text:
          `${city} ${region} ${id} ${offset_label}`.toLowerCase().replace(/_/g, " "),
      };
    })
    .sort((a, b) => {
      if (a.offset_minutes !== b.offset_minutes)
        return a.offset_minutes - b.offset_minutes;

      return a.city.localeCompare(b.city);
    });
}

export function format_time_in_zone(
  zone: string,
  use_24h: boolean,
  at = new Date(),
): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit",
      hour12: !use_24h,
    }).format(at);
  } catch {
    return "";
  }
}
