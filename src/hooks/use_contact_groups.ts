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
import type { ContactGroup, ContactGroupFormData } from "@/types/contacts";

import { useCallback, useEffect, useState } from "react";

import {
  list_contact_groups,
  create_contact_group,
  update_contact_group,
  delete_contact_group,
} from "@/services/api/contacts";
import { use_auth_safe } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";

export const CONTACT_GROUPS_CHANGED_EVENT = "astermail:contact-groups-changed";

export const MAX_CONTACT_GROUPS = 500;
export const MAX_CONTACT_GROUP_NAME_LENGTH = 100;

const cached_groups: { data: ContactGroup[]; loaded: boolean } = {
  data: [],
  loaded: false,
};

let inflight_fetch: Promise<string | null> | null = null;

export function clear_contact_groups_cache(): void {
  cached_groups.data = [];
  cached_groups.loaded = false;
  inflight_fetch = null;
}

export function emit_contact_groups_changed(): void {
  window.dispatchEvent(new CustomEvent(CONTACT_GROUPS_CHANGED_EVENT));
}

function sort_groups(groups: ContactGroup[]): ContactGroup[] {
  return [...groups].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;

    return a.name.localeCompare(b.name);
  });
}

interface ContactGroupsState {
  groups: ContactGroup[];
  is_loading: boolean;
  error: string | null;
}

export function use_contact_groups() {
  const { t } = use_i18n();
  const auth = use_auth_safe();
  const has_keys = auth?.has_keys ?? false;
  const [state, set_state] = useState<ContactGroupsState>({
    groups: cached_groups.data,
    is_loading: !cached_groups.loaded,
    error: null,
  });

  const fetch_groups = useCallback(async () => {
    if (!has_keys) return;

    set_state((prev) => ({ ...prev, is_loading: prev.groups.length === 0 }));

    if (!inflight_fetch) {
      const pending = (async (): Promise<string | null> => {
        const response = await list_contact_groups();

        if (response.error || !response.data) return response.error || "";

        const sorted = sort_groups(response.data.groups);

        cached_groups.data = sorted;
        cached_groups.loaded = true;

        return null;
      })();

      inflight_fetch = pending;
      pending
        .catch(() => null)
        .finally(() => {
          if (inflight_fetch === pending) inflight_fetch = null;
        });
    }

    const failure = await inflight_fetch;

    if (failure !== null) {
      set_state((prev) => ({
        ...prev,
        is_loading: false,
        error: failure || t("common.failed_to_fetch_contact_groups"),
      }));

      return;
    }

    set_state({ groups: cached_groups.data, is_loading: false, error: null });
  }, [has_keys, t]);

  useEffect(() => {
    fetch_groups();
  }, [fetch_groups]);

  useEffect(() => {
    const handle_changed = () => {
      fetch_groups();
    };

    window.addEventListener(CONTACT_GROUPS_CHANGED_EVENT, handle_changed);

    return () =>
      window.removeEventListener(CONTACT_GROUPS_CHANGED_EVENT, handle_changed);
  }, [fetch_groups]);

  const create_group = useCallback(
    async (data: ContactGroupFormData): Promise<ContactGroup | null> => {
      const response = await create_contact_group(data);

      if (response.error || !response.data) return null;

      emit_contact_groups_changed();

      return response.data;
    },
    [],
  );

  const rename_group = useCallback(
    async (group_id: string, data: ContactGroupFormData): Promise<boolean> => {
      const response = await update_contact_group(group_id, data);

      if (response.error || !response.data) return false;

      emit_contact_groups_changed();

      return true;
    },
    [],
  );

  const remove_group = useCallback(
    async (group_id: string): Promise<boolean> => {
      const response = await delete_contact_group(group_id);

      if (response.error) return false;

      emit_contact_groups_changed();

      return true;
    },
    [],
  );

  return {
    state,
    groups: state.groups,
    is_loading: state.is_loading,
    error: state.error,
    fetch_groups,
    create_group,
    rename_group,
    remove_group,
  };
}
