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
import type { EmailCategory } from "@/types/email";
import type { CategoryCounts } from "@/services/category_index";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { use_preferences } from "@/contexts/preferences_context";
import { CATEGORY_TABS } from "@/services/mail_categorizer";
import {
  get_counts,
  mark_category_seen,
  subscribe as subscribe_index,
  get_version as get_index_version,
} from "@/services/category_index";
import {
  secure_store,
  secure_retrieve,
} from "@/services/crypto/secure_storage";

const ACTIVE_CATEGORY_KEY = "astermail_active_category";

function is_tab(value: unknown): value is EmailCategory {
  return (
    typeof value === "string" &&
    (CATEGORY_TABS as readonly string[]).includes(value)
  );
}

export interface UseInboxCategoriesReturn {
  enabled: boolean;
  active_category: EmailCategory;
  set_active_category: (category: EmailCategory) => void;
  counts: CategoryCounts;
}

export function use_inbox_categories(
  current_view: string,
): UseInboxCategoriesReturn {
  const { preferences } = use_preferences();

  const enabled =
    preferences.inbox_categories_enabled !== false &&
    (current_view === "inbox" || current_view === "");

  const [active_category, set_active_category_state] =
    useState<EmailCategory>("primary");

  const index_version = useSyncExternalStore(
    subscribe_index,
    get_index_version,
    get_index_version,
  );

  const counts = useMemo(() => get_counts(), [index_version]);

  // The last-viewed tab is persisted vault-encrypted (AES-256-GCM + HMAC), not
  // as plaintext, so it leaves no readable behavioral signal on disk.
  useEffect(() => {
    let cancelled = false;

    secure_retrieve<EmailCategory>(ACTIVE_CATEGORY_KEY)
      .then((stored) => {
        if (!cancelled && is_tab(stored)) {
          set_active_category_state(stored);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    mark_category_seen(active_category);
  }, [enabled, active_category]);

  const set_active_category = useCallback((category: EmailCategory) => {
    set_active_category_state(category);
    void secure_store(ACTIVE_CATEGORY_KEY, category).catch(() => {});
  }, []);

  return {
    enabled,
    active_category,
    set_active_category,
    counts,
  };
}
