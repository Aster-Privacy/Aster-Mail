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
import type { CSSProperties } from "react";

import { use_translation } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/types";
import { css_color_to_hex } from "@/lib/avatar_color";
import { cn } from "@/lib/utils";

export type PlanBadgeTier = "star" | "nova" | "supernova";

const TIER_LABEL_KEYS: Record<PlanBadgeTier, TranslationKey> = {
  star: "settings.plan_badge_star",
  nova: "settings.plan_badge_nova",
  supernova: "settings.plan_badge_supernova",
};

const DEFAULT_ACCENT = "#3b82f6";

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
  accent_color?: string | null;
  className?: string;
}

export function PlanBadge({
  plan_code,
  accent_color,
  className,
}: PlanBadgeProps) {
  const { t } = use_translation();
  const tier = plan_badge_tier(plan_code);

  if (!tier) return null;

  const accent =
    (accent_color ? css_color_to_hex(accent_color) : null) ?? DEFAULT_ACCENT;

  const label = t(TIER_LABEL_KEYS[tier]);

  const style = { "--plan_badge_accent": accent } as CSSProperties;

  return (
    <span
      aria-label={t("settings.plan_badge_aria", { plan: label })}
      className={cn("plan_badge", `plan_badge_tier_${tier}`, className)}
      style={style}
      title={t("settings.plan_badge_aria", { plan: label })}
    >
      {tier === "supernova" && (
        <svg
          aria-hidden="true"
          className="plan_badge_spark"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 1.6l2.15 6.03a4 4 0 002.22 2.22L22.4 12l-6.03 2.15a4 4 0 00-2.22 2.22L12 22.4l-2.15-6.03a4 4 0 00-2.22-2.22L1.6 12l6.03-2.15a4 4 0 002.22-2.22L12 1.6z" />
        </svg>
      )}
      <span>{label}</span>
    </span>
  );
}
