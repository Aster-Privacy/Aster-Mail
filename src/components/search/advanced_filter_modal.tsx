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
import type { FilterState } from "@/components/search/search_modal_types";

import { useCallback, useEffect, useState } from "react";

import { Modal, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { SearchModalFilterPanel } from "@/components/search/search_modal_filter_panel";
import { use_i18n } from "@/lib/i18n/context";
import {
  apply_filter_state_to_query,
  filter_state_from_query,
} from "@/utils/search_filter_state";

export interface AdvancedFilterModalProps {
  is_open: boolean;
  on_close: () => void;
  query: string;
  scope_view?: string;
  on_search_submit: (query: string) => void;
}

export function AdvancedFilterModal({
  is_open,
  on_close,
  query,
  scope_view,
  on_search_submit,
}: AdvancedFilterModalProps) {
  const { t } = use_i18n();
  const [filters, set_filters] = useState<FilterState>(() =>
    filter_state_from_query(query, scope_view),
  );

  useEffect(() => {
    if (is_open) set_filters(filter_state_from_query(query, scope_view));
  }, [is_open, query, scope_view]);

  const submit = useCallback(() => {
    on_search_submit(apply_filter_state_to_query(query, filters, scope_view));
    on_close();
  }, [query, filters, scope_view, on_search_submit, on_close]);

  return (
    <Modal is_open={is_open} on_close={on_close} size="lg">
      <ModalHeader>
        <ModalTitle>{t("mail.chip_advanced_search")}</ModalTitle>
      </ModalHeader>
      <SearchModalFilterPanel
        show_filters
        filters={filters}
        on_submit={submit}
        set_filters={set_filters}
      />
    </Modal>
  );
}
