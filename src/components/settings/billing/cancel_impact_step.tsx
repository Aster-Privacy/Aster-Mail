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

interface ImpactLine {
  key: string;
  text: string;
  is_warning?: boolean;
}

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

  const lines: ImpactLine[] = [];

  if (impact) {
    lines.push({
      key: "storage",
      text: t("settings.cancel_impact_storage", {
        current: format_storage(impact.storage_limit_bytes),
        after: format_storage(impact.storage_limit_after_bytes),
      }),
    });

    if (impact.storage_over_limit) {
      lines.push({
        key: "storage_over",
        is_warning: true,
        text: t("settings.cancel_impact_storage_over", {
          used: format_storage(impact.storage_used_bytes),
        }),
      });
    }

    if (impact.aliases_to_disable > 0) {
      lines.push({
        key: "aliases",
        text: t("settings.cancel_impact_aliases", {
          count: impact.aliases_to_disable,
          days: impact.alias_grace_days,
        }),
      });
    }

    if (impact.domains_to_suspend > 0) {
      lines.push({
        key: "domains",
        text: t("settings.cancel_impact_domains", {
          count: impact.domains_to_suspend,
        }),
      });
    }

    if (impact.catch_all_to_revoke > 0) {
      lines.push({
        key: "catch_all",
        text: t("settings.cancel_impact_catch_all"),
      });
    }

    if (impact.templates_to_disable > 0) {
      lines.push({
        key: "templates",
        text: t("settings.cancel_impact_templates", {
          count: impact.templates_to_disable,
        }),
      });
    }

    if (impact.signatures_to_disable > 0) {
      lines.push({
        key: "signatures",
        text: t("settings.cancel_impact_signatures", {
          count: impact.signatures_to_disable,
        }),
      });
    }

    if (impact.family_members_affected > 0) {
      lines.push({
        key: "family",
        text: t("settings.cancel_impact_family", {
          count: impact.family_members_affected,
          days: impact.family_grace_days,
        }),
      });
    }

    if (impact.family_addresses_released > 0) {
      lines.push({
        key: "family_addresses",
        text: t("settings.cancel_impact_family_addresses", {
          count: impact.family_addresses_released,
        }),
      });
    }

    if (impact.features_lost.length > 0) {
      lines.push({
        key: "features",
        text: t("settings.cancel_impact_features", {
          count: impact.features_lost.length,
        }),
      });
    }
  }

  return (
    <div className="py-1">
      {is_loading ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-edge-secondary px-3 py-6">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-edge-secondary border-t-txt-muted" />
          <span className="text-sm text-txt-muted">
            {t("settings.cancel_impact_loading")}
          </span>
        </div>
      ) : lines.length === 0 ? (
        <p className="rounded-lg border border-edge-secondary px-3 py-4 text-sm text-txt-secondary">
          {t("settings.cancel_impact_unavailable")}
        </p>
      ) : (
        <ul className="max-h-[40vh] divide-y divide-edge-secondary overflow-y-auto rounded-lg border border-edge-secondary">
          {lines.map((line) => (
            <li
              key={line.key}
              className="px-3.5 py-2.5 text-sm leading-relaxed text-txt-secondary"
              style={
                line.is_warning ? { color: "var(--destructive)" } : undefined
              }
            >
              {line.text}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs leading-relaxed text-txt-muted">
        {t("settings.cancel_impact_reactivate_hint")}
      </p>

      <div className="mt-5 flex flex-row items-center gap-2">
        {keep_plan_slot}
        <div className="ms-auto flex flex-row items-center gap-2">
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
