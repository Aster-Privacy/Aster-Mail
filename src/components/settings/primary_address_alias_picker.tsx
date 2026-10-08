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

const SEARCH_VISIBLE_THRESHOLD = 8;

interface PrimaryAddressAliasPickerProps {
  aliases: string[];
  selected: string | null;
  on_select: (address: string) => void;
}

export function PrimaryAddressAliasPicker({
  aliases,
  selected,
  on_select,
}: PrimaryAddressAliasPickerProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const [query, set_query] = useState("");
  const list_ref = useRef<HTMLDivElement>(null);

  const show_search = aliases.length > SEARCH_VISIBLE_THRESHOLD;
  const normalized_query = query.trim().toLowerCase();

  const visible_aliases = useMemo(
    () =>
      normalized_query
        ? aliases.filter((address) =>
            address.toLowerCase().includes(normalized_query),
          )
        : aliases,
    [aliases, normalized_query],
  );

  useEffect(() => {
    if (!is_open) set_query("");
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
  }, [is_open, visible_aliases.length]);

  const handle_select = (address: string) => {
    on_select(address);
    set_is_open(false);
  };

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverTrigger asChild>
        <button
          aria-label={t("settings.address_change_use_alias")}
          className="aster_select_trigger group flex h-10 w-full items-center justify-between gap-2 overflow-hidden border-0 ps-3.5 pe-3 text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]/50"
          type="button"
        >
          <span
            className={`min-w-0 truncate ${selected ? "" : "text-[var(--text-muted)]"}`}
          >
            {selected ?? t("settings.address_change_alias_placeholder")}
          </span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        {show_search && (
          <div className="flex items-center gap-2 border-b border-[var(--aster-floating-divider)] px-3.5 py-2.5">
            <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-txt-muted" />
            <input
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full bg-transparent text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none"
              placeholder={t("settings.address_change_alias_search")}
              spellCheck={false}
              value={query}
              onChange={(event) => set_query(event.target.value)}
            />
          </div>
        )}
        <div
          ref={list_ref}
          className="max-h-64 overflow-y-auto overscroll-contain p-1.5"
        >
          {visible_aliases.map((address) => (
            <button
              key={address}
              className={`flex w-full items-center gap-2 rounded-[var(--aster-radius-item)] px-2.5 py-2 text-start transition-colors ${
                address === selected
                  ? "bg-[var(--aster-selected)]"
                  : "hover:bg-[var(--aster-floating-hover)]"
              }`}
              type="button"
              onClick={() => handle_select(address)}
            >
              <span className="min-w-0 flex-1 truncate text-sm text-txt-primary">
                {address}
              </span>
              {address === selected && (
                <CheckIcon className="h-4 w-4 flex-shrink-0 text-txt-primary" />
              )}
            </button>
          ))}
          {visible_aliases.length === 0 && (
            <p className="px-2.5 py-6 text-center text-[13px] text-txt-muted">
              {t("settings.address_change_alias_no_results")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
