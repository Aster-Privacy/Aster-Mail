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
import { FunnelIcon } from "@heroicons/react/24/outline";

import { ListEmptyState } from "@/components/common/list_empty_state";
import { use_i18n } from "@/lib/i18n/context";

interface FilterEmptyStateProps {
  on_clear: () => void;
}

export function FilterEmptyState({
  on_clear,
}: FilterEmptyStateProps): React.ReactElement {
  const { t } = use_i18n();

  return (
    <ListEmptyState
      actions={[
        {
          label: t("mail.filter_empty_clear"),
          on_click: on_clear,
          testid: "filter-empty-clear",
        },
      ]}
      description={t("mail.search_filters_active")}
      icon={FunnelIcon}
      testid="filter-empty-state"
      title={t("mail.filter_empty_title")}
    />
  );
}
