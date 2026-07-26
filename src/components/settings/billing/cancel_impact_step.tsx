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

import { button_variants } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  format_storage,
  type CancelImpactResponse,
} from "@/services/api/billing";

export type CancelStep = "reason" | "impact" | "password" | "confirm";

interface CancelImpactStepProps {
  impact: CancelImpactResponse | null;
  is_loading: boolean;
  keep_plan_slot?: ReactNode;
  on_back: () => void;
  on_continue: () => void;
}

export function CancelImpactStep({
  impact,
  is_loading,
  keep_plan_slot,
  on_back,
  on_continue,
}: CancelImpactStepProps) {
  const { t } = use_i18n();

  const lines: string[] = [];

  if (impact) {
    lines.push(
      t("settings.cancel_impact_storage", {
        current: format_storage(impact.storage_limit_bytes),
        after: format_storage(impact.storage_limit_after_bytes),
      }),
    );

    if (impact.storage_over_limit) {
      lines.push(
        t("settings.cancel_impact_storage_over", {
          used: format_storage(impact.storage_used_bytes),
        }),
      );
    }

    if (impact.aliases_to_disable > 0) {
      lines.push(
        t("settings.cancel_impact_aliases", {
          count: String(impact.aliases_to_disable),
          days: String(impact.alias_grace_days),
        }),
      );
    }

    if (impact.domains_to_suspend > 0) {
      lines.push(
        t("settings.cancel_impact_domains", {
          count: String(impact.domains_to_suspend),
        }),
      );
    }

    if (impact.catch_all_to_revoke > 0) {
      lines.push(t("settings.cancel_impact_catch_all"));
    }

    if (impact.templates_to_disable > 0) {
      lines.push(
        t("settings.cancel_impact_templates", {
          count: String(impact.templates_to_disable),
        }),
      );
    }

    if (impact.signatures_to_disable > 0) {
      lines.push(
        t("settings.cancel_impact_signatures", {
          count: String(impact.signatures_to_disable),
        }),
      );
    }

    if (impact.family_members_affected > 0) {
      lines.push(
        t("settings.cancel_impact_family", {
          count: String(impact.family_members_affected),
          days: String(impact.family_grace_days),
        }),
      );
    }

    if (impact.family_addresses_released > 0) {
      lines.push(
        t("settings.cancel_impact_family_addresses", {
          count: String(impact.family_addresses_released),
        }),
      );
    }

    if (impact.features_lost.length > 0) {
      lines.push(
        t("settings.cancel_impact_features", {
          count: String(impact.features_lost.length),
        }),
      );
    }
  }

  return (
    <div className="py-1">
      {is_loading ? (
        <p className="text-sm text-txt-muted">
          {t("settings.cancel_impact_loading")}
        </p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-txt-secondary">
          {t("settings.cancel_impact_unavailable")}
        </p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li
              key={line}
              className="flex items-start gap-2.5 text-sm text-txt-secondary"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: "var(--destructive)" }}
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-txt-muted">
        {t("settings.cancel_impact_reactivate_hint")}
      </p>

      <div className="mt-5 flex flex-row items-center gap-2">
        {keep_plan_slot}
        <div className="ml-auto flex flex-row items-center gap-2">
          <button
            className={button_variants({ variant: "ghost", size: "sm" })}
            type="button"
            onClick={on_back}
          >
            {t("common.back")}
          </button>
          <button
            className={button_variants({ variant: "primary", size: "sm" })}
            disabled={is_loading}
            type="button"
            onClick={on_continue}
          >
            {t("settings.cancel_impact_continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
