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
import { Fragment, useMemo, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  MinusIcon,
} from "@heroicons/react/24/outline";

import {
  get_plan_comparison_rows,
  type ComparisonRow,
} from "@/components/settings/billing/plan_comparison_table";
import { use_i18n } from "@/lib/i18n/context";

type ColumnKey = "free" | "star" | "nova" | "supernova";

const COLUMNS: ColumnKey[] = ["free", "star", "nova", "supernova"];

function render_cell(value: string) {
  if (value === "\u2713") {
    return (
      <CheckIcon
        aria-hidden="true"
        className="mx-auto h-4 w-4"
        style={{ color: "var(--accent-blue)" }}
      />
    );
  }

  if (value === "-") {
    return (
      <MinusIcon
        aria-hidden="true"
        className="mx-auto h-4 w-4 text-txt-muted"
      />
    );
  }

  return value;
}

interface PlanComparisonSectionProps {
  current_plan_code?: string | null;
}

export function PlanComparisonSection({
  current_plan_code,
}: PlanComparisonSectionProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const rows = useMemo<ComparisonRow[]>(() => get_plan_comparison_rows(t), [t]);
  const column_labels: Record<ColumnKey, string> = {
    free: t("settings.plan_free"),
    star: "Star",
    nova: "Nova",
    supernova: "Supernova",
  };
  const active_column =
    COLUMNS.find((key) => key === current_plan_code) ?? null;

  return (
    <div className="mt-4 mb-6">
      <div className="flex justify-center">
        <button
          aria-expanded={is_open}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          style={{ color: "var(--accent-blue)" }}
          type="button"
          onClick={() => set_is_open((open) => !open)}
        >
          {is_open
            ? t("settings.compare_features_hide")
            : t("settings.compare_features_show")}
          <ChevronDownIcon
            aria-hidden="true"
            className={`h-4 w-4 transition-transform ${is_open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {is_open && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-edge-secondary">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="bg-surf-tertiary">
                <th
                  className="sticky start-0 z-10 bg-surf-tertiary px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-txt-muted"
                  scope="col"
                >
                  {t("settings.feature")}
                </th>
                {COLUMNS.map((key) => (
                  <th
                    key={key}
                    className={`px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide ${
                      active_column === key
                        ? "text-txt-primary"
                        : "text-txt-muted"
                    }`}
                    scope="col"
                  >
                    {column_labels[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <Fragment key={row.label}>
                  {(index === 0 ||
                    rows[index - 1].category !== row.category) && (
                    <tr>
                      <th
                        className="sticky start-0 z-10 border-t border-edge-secondary bg-surf-tertiary px-4 py-2 text-start text-[11px] font-semibold uppercase tracking-wide text-txt-muted"
                        colSpan={COLUMNS.length + 1}
                        scope="colgroup"
                      >
                        {row.category}
                      </th>
                    </tr>
                  )}
                  <tr className="border-t border-edge-secondary">
                    <th
                      className="sticky start-0 z-10 bg-surf-secondary px-4 py-2.5 text-start font-normal text-txt-secondary"
                      scope="row"
                    >
                      {row.label}
                    </th>
                    {COLUMNS.map((key) => (
                      <td
                        key={key}
                        className={`px-3 py-2.5 text-center tabular-nums ${
                          active_column === key
                            ? "font-semibold text-txt-primary"
                            : "text-txt-secondary"
                        }`}
                      >
                        {render_cell(row[key])}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
