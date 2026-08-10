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

import type { AppliedCorrection } from "@/hooks/use_search/types";

import { use_i18n } from "@/lib/i18n/context";

interface CorrectionNoticeProps {
  correction: AppliedCorrection | null;
  on_dismiss: () => void;
  className?: string;
}

export function CorrectionNotice({
  correction,
  on_dismiss,
  className,
}: CorrectionNoticeProps) {
  const { t } = use_i18n();

  if (!correction) return null;

  return (
    <div
      aria-live="polite"
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3.5 py-2 text-xs ${className ?? ""}`}
    >
      <span style={{ color: "var(--text-primary)" }}>
        {t("mail.showing_results_for", {
          corrected: correction.corrected_term,
        })}
      </span>
      <button
        className="rounded px-1 py-0.5 font-medium text-[var(--accent-blue)] transition-colors hover:bg-[var(--accent-blue)]/10"
        type="button"
        onClick={on_dismiss}
      >
        {t("mail.search_instead_for", { original: correction.original_term })}
      </button>
    </div>
  );
}
