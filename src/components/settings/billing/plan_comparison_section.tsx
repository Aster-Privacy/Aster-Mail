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
import { useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

import { PlanComparisonTable } from "@/components/settings/billing/plan_comparison_table";
import { use_i18n } from "@/lib/i18n/context";

interface PlanComparisonSectionProps {
  current_plan_code?: string | null;
}

export function PlanComparisonSection({
  current_plan_code,
}: PlanComparisonSectionProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);

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
        <div className="mt-4">
          <PlanComparisonTable highlight_plan_code={current_plan_code} />
        </div>
      )}
    </div>
  );
}
