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
import { use_i18n } from "@/lib/i18n/context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { results_filter, results_sort } from "./domain_results_utils";

export interface DomainResultsToolbarProps {
  tlds: string[];
  active_tld: string | null;
  on_tld: (tld: string | null) => void;
  filter: results_filter;
  on_filter: (f: results_filter) => void;
  sort: results_sort;
  on_sort: (s: results_sort) => void;
  max_price: number | null;
  on_max_price: (cents: number | null) => void;
  count: number;
}

const FILTER_OPTIONS: results_filter[] = ["all", "available", "taken"];

const SORT_OPTIONS: results_sort[] = [
  "relevance",
  "price_low",
  "price_high",
  "az",
  "discount",
];

const MAX_PRICE_OPTIONS: number[] = [500, 1000, 2000, 5000];

const format_max_price = (cents: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

export function DomainResultsToolbar({
  tlds,
  active_tld,
  on_tld,
  filter,
  on_filter,
  sort,
  on_sort,
  max_price,
  on_max_price,
  count,
}: DomainResultsToolbarProps) {
  const { t } = use_i18n();

  const filter_labels: Record<results_filter, string> = {
    all: t("settings.domain_purchase_filter_all"),
    available: t("settings.domain_purchase_filter_available"),
    taken: t("settings.domain_purchase_filter_taken"),
  };

  const sort_labels: Record<results_sort, string> = {
    relevance: t("settings.domain_purchase_sort_relevance"),
    price_low: t("settings.domain_purchase_sort_price_low"),
    price_high: t("settings.domain_purchase_sort_price_high"),
    az: t("settings.domain_purchase_sort_az"),
    discount: t("settings.domain_purchase_sort_discount"),
  };

  const tld_chip_class = (selected: boolean) =>
    selected
      ? "shrink-0 h-8 px-3.5 rounded-full text-[13px] font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-1 focus-visible:ring-offset-surf-primary"
      : "shrink-0 h-8 px-3.5 rounded-full text-[13px] font-medium border border-edge-secondary text-txt-secondary hover:bg-surf-secondary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-1 focus-visible:ring-offset-surf-primary";

  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div
        role="group"
        aria-label={t("mail.filter")}
        className="shrink-0 flex items-center rounded-full border border-edge-secondary overflow-hidden"
      >
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => on_filter(option)}
            className={
              filter === option
                ? "h-8 px-3.5 text-[13px] font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-color)]"
                : "h-8 px-3.5 text-[13px] font-medium text-txt-secondary hover:bg-surf-secondary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-color)]"
            }
            style={
              filter === option
                ? { backgroundColor: "var(--accent-color)" }
                : undefined
            }
          >
            {filter_labels[option]}
          </button>
        ))}
      </div>

      <div className="shrink-0 w-px h-5 bg-edge-secondary" aria-hidden="true" />

      <button
        type="button"
        aria-pressed={active_tld === null}
        onClick={() => on_tld(null)}
        className={tld_chip_class(active_tld === null)}
        style={
          active_tld === null
            ? { backgroundColor: "var(--accent-color)" }
            : undefined
        }
      >
        {t("settings.domain_purchase_filter_all")}
      </button>
      {tlds.map((tld) => (
        <button
          key={tld}
          type="button"
          aria-pressed={active_tld === tld}
          onClick={() => on_tld(tld)}
          className={tld_chip_class(active_tld === tld)}
          style={
            active_tld === tld
              ? { backgroundColor: "var(--accent-color)" }
              : undefined
          }
        >
          {`.${tld.replace(/^\./, "")}`}
        </button>
      ))}

      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[13px] text-txt-muted whitespace-nowrap mr-auto">
          {t("settings.domain_purchase_results_count").replace(
            "{{count}}",
            String(count),
          )}
        </span>
        <span className="text-[13px] text-txt-muted whitespace-nowrap">
          {t("settings.domain_purchase_filter_price")}
        </span>
        <Select
          value={max_price === null ? "any" : String(max_price)}
          onValueChange={(value) =>
            on_max_price(value === "any" ? null : Number(value))
          }
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">
              {t("settings.domain_purchase_filter_price_any")}
            </SelectItem>
            {MAX_PRICE_OPTIONS.map((cents) => (
              <SelectItem key={cents} value={String(cents)}>
                {format_max_price(cents)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[13px] text-txt-muted whitespace-nowrap">
          {t("settings.domain_purchase_sort_by")}
        </span>
        <Select
          value={sort}
          onValueChange={(value) => on_sort(value as results_sort)}
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {sort_labels[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
