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
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

interface RecommendationBoxProps {
  children: React.ReactNode;
}

export function RecommendationBox({ children }: RecommendationBoxProps) {
  return (
    <div className="inline-flex items-center gap-1.5 mt-1.5 max-w-full">
      <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
      <p className="text-xs text-amber-600 dark:text-amber-400 leading-snug">
        {children}
      </p>
    </div>
  );
}

interface ActionRecommendedBadgeProps {
  tip?: string;
}

export function ActionRecommendedBadge({ tip }: ActionRecommendedBadgeProps) {
  const { t } = use_i18n();

  const label = (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium"
      style={{ color: "var(--color-warning, #f59e0b)" }}
    >
      <ExclamationTriangleIcon className="w-3.5 h-3.5" />
      {t("settings.action_recommended")}
    </span>
  );

  if (!tip) return label;

  return <Tooltip tip={tip}>{label}</Tooltip>;
}
