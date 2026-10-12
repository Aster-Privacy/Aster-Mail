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
import { FunnelIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

interface FilterEmptyStateProps {
  on_clear: () => void;
}

export function FilterEmptyState({
  on_clear,
}: FilterEmptyStateProps): React.ReactElement {
  const { t } = use_i18n();

  return (
    <div
      className="flex flex-col items-center justify-center px-6 py-24 text-center"
      data-testid="filter-empty-state"
    >
      <FunnelIcon className="mb-4 h-12 w-12 text-txt-muted" strokeWidth={1.25} />
      <h3 className="text-base font-semibold text-txt-primary">
        {t("mail.filter_empty_title")}
      </h3>
      <button
        className="mt-3 rounded-lg border border-[var(--border-primary)] px-4 py-1.5 text-[13px] font-medium text-[var(--text-primary)]"
        data-testid="filter-empty-clear"
        type="button"
        onClick={on_clear}
      >
        {t("mail.filter_empty_clear")}
      </button>
    </div>
  );
}
