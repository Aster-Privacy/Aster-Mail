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
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { use_i18n } from "@/lib/i18n/context";
import {
  build_time_zone_options,
  format_time_in_zone,
  get_device_time_zone,
  type TimeZoneOption,
} from "@/lib/time_zones";

const SUGGESTED_ZONE_IDS = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

interface TimeZonePickerProps {
  value: string;
  on_change: (value: string) => void;
  use_24h: boolean;
}

export function TimeZonePicker({
  value,
  on_change,
  use_24h,
}: TimeZonePickerProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const [query, set_query] = useState("");
  const [show_all, set_show_all] = useState(false);
  const list_ref = useRef<HTMLDivElement>(null);

  const all_options = useMemo(() => build_time_zone_options(), []);
  const options_by_id = useMemo(
    () => new Map(all_options.map((option) => [option.id, option])),
    [all_options],
  );

  const device_zone = useMemo(() => get_device_time_zone(), []);

  const suggested_options = useMemo(() => {
    const ids = [device_zone, ...SUGGESTED_ZONE_IDS];
    const seen = new Set<string>();
    const result: TimeZoneOption[] = [];

    for (const id of ids) {
      const option = options_by_id.get(id);

      if (!option || seen.has(option.id)) continue;
      seen.add(option.id);
      result.push(option);
    }

    return result;
  }, [device_zone, options_by_id]);

  const normalized_query = query.trim().toLowerCase();

  const visible_options = useMemo(() => {
    if (normalized_query) {
      return all_options.filter((option) =>
        option.search_text.includes(normalized_query),
      );
    }

    return show_all ? all_options : suggested_options;
  }, [all_options, normalized_query, show_all, suggested_options]);

  useEffect(() => {
    if (is_open) return;
    set_query("");
    set_show_all(false);
  }, [is_open]);

  useEffect(() => {
    const node = list_ref.current;

    if (!node) return;

    const handle_wheel = (event: WheelEvent) => {
      if (node.scrollHeight <= node.clientHeight) return;

      const delta =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * node.clientHeight
            : event.deltaY;

      event.preventDefault();
      event.stopPropagation();
      node.scrollTop += delta;
    };

    node.addEventListener("wheel", handle_wheel, { passive: false });

    return () => node.removeEventListener("wheel", handle_wheel);
  }, [is_open, visible_options.length]);

  const selected_option = value === "auto" ? undefined : options_by_id.get(value);
  const effective_zone = selected_option?.id ?? device_zone;
  const effective_option = options_by_id.get(effective_zone);

  const trigger_label =
    value === "auto"
      ? t("settings.time_zone_auto")
      : `${selected_option?.city ?? value} (${selected_option?.offset_label ?? ""})`;

  const handle_select = (next: string) => {
    on_change(next);
    set_is_open(false);
  };

  const render_row = (
    id: string,
    primary: string,
    secondary: string,
    trailing: string,
  ) => (
    <button
      key={id}
      type="button"
      onClick={() => handle_select(id)}
      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
    >
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
        {value === id && <CheckIcon className="h-4 w-4 text-brand" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-txt-primary">
          {primary}
        </span>
        {secondary && (
          <span className="block truncate text-[11px] text-txt-muted">
            {secondary}
          </span>
        )}
      </span>
      <span className="flex-shrink-0 text-[11px] tabular-nums text-txt-muted">
        {trailing}
      </span>
    </button>
  );

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-[240px] items-center justify-between gap-2 overflow-hidden rounded-lg border border-[var(--border-secondary)] bg-[var(--input-bg)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] data-[state=open]:bg-[var(--bg-secondary)] focus:outline-none"
          style={{ boxShadow: "var(--select-shadow)" }}
        >
          <span className="min-w-0 truncate">{trigger_label}</span>
          <ChevronDownIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[320px] rounded-lg border border-[var(--border-secondary)] bg-[var(--dropdown-bg)] p-0"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-secondary)] px-3 py-2">
          <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-txt-muted" />
          <input
            autoFocus
            value={query}
            onChange={(event) => set_query(event.target.value)}
            placeholder={t("settings.time_zone_search_placeholder")}
            className="w-full bg-transparent text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none"
          />
        </div>
        <div ref={list_ref} className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
          {!normalized_query &&
            render_row(
              "auto",
              t("settings.time_zone_auto"),
              effective_option?.city ?? device_zone,
              format_time_in_zone(effective_zone, use_24h),
            )}
          {visible_options.map((option) =>
            render_row(
              option.id,
              option.city,
              option.region ? `${option.region} · ${option.offset_label}` : option.offset_label,
              format_time_in_zone(option.id, use_24h),
            ),
          )}
          {visible_options.length === 0 && (
            <p className="px-2.5 py-6 text-center text-[13px] text-txt-muted">
              {t("settings.time_zone_no_results")}
            </p>
          )}
        </div>
        {!normalized_query && !show_all && (
          <button
            type="button"
            onClick={() => set_show_all(true)}
            className="w-full border-t border-[var(--border-secondary)] px-3 py-2 text-[12px] font-medium text-txt-secondary transition-colors hover:text-txt-primary"
          >
            {t("settings.time_zone_show_all")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
