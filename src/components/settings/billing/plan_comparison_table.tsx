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
import type { TranslationKey } from "@/lib/i18n/types";

import { useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  XMarkIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

type TranslateFunction = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export interface ComparisonRow {
  label: string;
  free: string;
  star: string;
  nova: string;
  supernova: string;
}

const cap = (s: string) => {
  const trimmed = s.trim();

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

export function get_plan_comparison_rows(
  t: TranslateFunction,
): ComparisonRow[] {
  return [
    {
      label: cap(t("settings.plan_f_storage", { value: "" })),
      free: "10 GB",
      star: "50 GB",
      nova: "500 GB",
      supernova: "5 TB",
    },
    {
      label: cap(t("settings.plan_f_attachments", { value: "" })),
      free: "25 MB",
      star: "50 MB",
      nova: "100 MB",
      supernova: "250 MB",
    },
    {
      label: t("settings.plan_f_signed_in_accounts"),
      free: "1",
      star: "2",
      nova: "4",
      supernova: "6",
    },
    {
      label: cap(t("settings.plan_f_aliases", { value: "" })),
      free: "5",
      star: "15",
      nova: t("settings.unlimited"),
      supernova: t("settings.unlimited"),
    },
    {
      label: cap(t("settings.plan_f_domains", { value: "" })),
      free: "1",
      star: "5",
      nova: "30",
      supernova: t("settings.unlimited"),
    },
    {
      label: cap(t("settings.plan_f_templates", { value: "" })),
      free: "3",
      star: "10",
      nova: t("settings.unlimited"),
      supernova: t("settings.unlimited"),
    },
    {
      label: cap(t("settings.plan_f_send_limit", { value: "" })),
      free: "200",
      star: t("settings.unlimited"),
      nova: t("settings.unlimited"),
      supernova: t("settings.unlimited"),
    },
    {
      label: cap(t("settings.plan_f_signatures", { value: "" })),
      free: "1",
      star: "5",
      nova: t("settings.unlimited"),
      supernova: t("settings.unlimited"),
    },
    {
      label: cap(t("settings.plan_f_mail_rules", { value: "" })),
      free: "2",
      star: t("settings.unlimited"),
      nova: t("settings.unlimited"),
      supernova: t("settings.unlimited"),
    },
    {
      label: cap(t("settings.plan_f_ghost_aliases", { value: "" })),
      free: "5",
      star: "25",
      nova: t("settings.unlimited"),
      supernova: t("settings.unlimited"),
    },
    {
      label: t("settings.plan_f_vacation_reply"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_catch_all"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_auto_forwarding"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_quiet_hours"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_imap_smtp"),
      free: "✓",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_external_accounts"),
      free: "-",
      star: "2",
      nova: "5",
      supernova: "5",
    },
    {
      label: t("settings.plan_f_alias_avatars"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_read_receipts"),
      free: "-",
      star: "-",
      nova: "-",
      supernova: "✓",
    },
  ];
}

export function PlanComparisonTable() {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(true);
  const rows = get_plan_comparison_rows(t);

  return (
    <div className="pt-4">
      <button
        className="w-full flex items-center justify-between py-3 text-left"
        type="button"
        onClick={() => set_is_open(!is_open)}
      >
        <div className="flex items-center gap-2">
          <TableCellsIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
          <h3 className="text-base font-semibold text-txt-primary">
            {t("settings.compare_plans")}
          </h3>
        </div>
        <ChevronDownIcon
          className={`w-4 h-4 text-txt-muted transition-transform ${is_open ? "rotate-180" : ""}`}
        />
      </button>
      <div className="h-px bg-edge-secondary" />

      {is_open && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-edge-secondary">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: "var(--bg-tertiary)" }}>
                <th className="text-left px-3 py-2.5 font-semibold text-txt-primary border-b border-edge-secondary min-w-[140px]">
                  {t("settings.feature")}
                </th>
                <th className="text-center px-2 py-2.5 font-semibold text-txt-muted border-b border-edge-secondary">
                  Free
                </th>
                <th className="text-center px-2 py-2.5 font-semibold text-txt-primary border-b border-edge-secondary">
                  Star
                </th>
                <th
                  className="text-center px-2 py-2.5 font-semibold border-b border-edge-secondary"
                  style={{ color: "var(--accent-blue)" }}
                >
                  Nova
                </th>
                <th className="text-center px-2 py-2.5 font-semibold text-txt-primary border-b border-edge-secondary">
                  Supernova
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    backgroundColor:
                      i % 2 === 0 ? "transparent" : "var(--bg-tertiary)",
                  }}
                >
                  <td className="px-3 py-2 text-txt-secondary border-b border-edge-secondary/50">
                    {row.label}
                  </td>
                  {(["free", "star", "nova", "supernova"] as const).map(
                    (plan) => (
                      <td
                        key={plan}
                        className="text-center px-2 py-2 border-b border-edge-secondary/50"
                      >
                        {row[plan] === "✓" ? (
                          <CheckIcon
                            className="w-4 h-4 mx-auto"
                            strokeWidth={2.5}
                            style={{ color: "var(--color-success)" }}
                          />
                        ) : row[plan] === "-" ? (
                          <XMarkIcon className="w-3.5 h-3.5 mx-auto text-txt-muted/40" />
                        ) : (
                          <span className="text-txt-primary font-medium">
                            {row[plan]}
                          </span>
                        )}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
