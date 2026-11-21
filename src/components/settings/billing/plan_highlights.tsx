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
import type { ReactNode } from "react";

import { CheckCircleIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

interface PlanHighlights {
  inherits: string | null;
  rows: ReactNode[];
}

function amount(value: string, rest: string): ReactNode {
  return (
    <>
      <strong className="font-semibold">{value}</strong> {rest}
    </>
  );
}

export function use_plan_highlights(tier_id: string): PlanHighlights {
  const { t } = use_i18n();
  const unlimited = t("settings.unlimited");
  const storage = t("settings.encrypted_storage_suffix");
  const aliases = t("settings.email_aliases_suffix");
  const domains = t("settings.custom_domains_suffix");
  const attachments = t("settings.attachments_suffix");

  if (tier_id === "star") {
    return {
      inherits: null,
      rows: [
        amount("50 GB", storage),
        amount("15", aliases),
        amount("5", domains),
        amount(unlimited, t("settings.mail_rules_suffix")),
        t("settings.f_e2ee"),
        t("settings.plan_f_imap_smtp_bridge"),
      ],
    };
  }
  if (tier_id === "nova") {
    return {
      inherits: "Star",
      rows: [
        amount("500 GB", storage),
        amount(unlimited, aliases),
        amount("30", domains),
        amount("100 MB", attachments),
        t("settings.plan_f_ghost_aliases", { value: unlimited }),
        t("settings.plan_f_multi_accounts", { value: "5" }),
        t("settings.f_folder_lock"),
        t("settings.plan_f_smart_folders"),
        t("settings.lockdown_title"),
        t("settings.plan_f_encrypted_exports"),
      ],
    };
  }

  return {
    inherits: "Nova",
    rows: [
      amount("5 TB", storage),
      amount(unlimited, domains),
      amount("250 MB", attachments),
      t("settings.plan_f_multi_accounts", { value: "20" }),
      t("settings.plan_f_support_dedicated"),
      t("settings.plan_f_early_access"),
    ],
  };
}

export function PlanCheckList({ rows }: { rows: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row, index) => (
        <li
          key={index}
          className="flex items-start gap-2.5 text-[13.5px] leading-snug text-txt-primary"
        >
          <CheckCircleIcon
            aria-hidden="true"
            className="mt-[1px] h-[18px] w-[18px] shrink-0"
            strokeWidth={2}
            style={{ color: "var(--accent-blue)" }}
          />
          <span className="flex-1">{row}</span>
        </li>
      ))}
    </ul>
  );
}

export function PlanHighlightList({ tier_id }: { tier_id: string }) {
  const { t } = use_i18n();
  const { inherits, rows } = use_plan_highlights(tier_id);

  return (
    <div className="flex flex-1 flex-col gap-3">
      {inherits && (
        <p className="text-[13px] font-semibold text-txt-secondary">
          {t("settings.plan_everything_in", { plan: inherits })}
        </p>
      )}
      <PlanCheckList rows={rows} />
    </div>
  );
}
