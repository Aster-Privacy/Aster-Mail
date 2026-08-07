// Aster Mail
// Copyright (C) 2026 Aster Privacy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { use_translation } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

export type PlanBadgeTier = "star" | "nova" | "supernova";

const TIER_LABEL_KEYS: Record<PlanBadgeTier, TranslationKey> = {
  star: "settings.plan_badge_star",
  nova: "settings.plan_badge_nova",
  supernova: "settings.plan_badge_supernova",
};

export function plan_badge_tier(
  plan_code: string | null | undefined,
): PlanBadgeTier | null {
  const normalized = (plan_code ?? "").trim().toLowerCase();

  if (normalized === "star") return "star";
  if (normalized === "nova") return "nova";
  if (normalized === "supernova") return "supernova";

  return null;
}

interface PlanBadgeProps {
  plan_code: string | null | undefined;
  className?: string;
}

export function PlanBadge({ plan_code, className }: PlanBadgeProps) {
  const { t } = use_translation();
  const tier = plan_badge_tier(plan_code);

  if (!tier) return null;

  const label = t(TIER_LABEL_KEYS[tier]);

  return (
    <span
      aria-label={t("settings.plan_badge_aria", { plan: label })}
      className={cn("plan_badge", `plan_badge_tier_${tier}`, className)}
      title={t("settings.plan_badge_thanks", { plan: label })}
    >
      {label}
    </span>
  );
}
