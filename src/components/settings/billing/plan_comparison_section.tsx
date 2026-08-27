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
import { ChevronDownIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

import {
  get_plan_comparison_rows,
  type ComparisonRow,
} from "@/components/settings/billing/plan_comparison_table";
import { use_i18n } from "@/lib/i18n/context";
import mail_logo_url from "@/assets/mail_logo.webp";

type ColumnKey = "free" | "star" | "nova" | "supernova";

const COLUMNS: ColumnKey[] = ["free", "star", "nova", "supernova"];

function render_cell(value: string) {
  if (value === "✓") {
    return (
      <CheckCircleIcon
        aria-hidden="true"
        className="mx-auto block h-[22px] w-[22px]"
        style={{ color: "#22c55e" }}
      />
    );
  }

  if (value === "-") {
    return (
      <XCircleIcon
        aria-hidden="true"
        className="mx-auto block h-[22px] w-[22px]"
        style={{ color: "#dc2626", strokeWidth: 1.8 }}
      />
    );
  }

  return <span className="text-sm font-medium text-txt-primary">{value}</span>;
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
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 overflow-hidden rounded-2xl border border-edge-secondary bg-surf-primary">
            <thead>
              <tr>
                <th className="w-[200px] border-b border-e border-edge-secondary" />
                {COLUMNS.map((key) => (
                  <th
                    key={key}
                    className="border-b border-e border-edge-secondary px-4 py-4 text-center align-top last:border-e-0"
                    scope="col"
                  >
                    <span
                      className="text-base font-semibold"
                      style={{
                        color:
                          active_column === key
                            ? "var(--accent-blue)"
                            : "var(--text-primary)",
                      }}
                    >
                      {column_labels[key]}
                    </span>
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
                      <td
                        className="border-b border-edge-secondary px-5 py-4"
                        colSpan={COLUMNS.length + 1}
                      >
                        <span className="flex items-center gap-2.5 text-[15px] font-semibold text-txt-primary">
                          <img
                            alt=""
                            aria-hidden="true"
                            className="h-6 w-6 rounded-md"
                            src={mail_logo_url}
                          />
                          {row.category}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <th
                      className="w-[200px] border-b border-e border-edge-secondary px-5 py-3 text-start text-sm font-normal text-txt-muted"
                      scope="row"
                    >
                      {row.label}
                    </th>
                    {COLUMNS.map((key) => (
                      <td
                        key={key}
                        className="border-b border-e border-edge-secondary px-4 py-3 text-center align-middle tabular-nums last:border-e-0"
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
