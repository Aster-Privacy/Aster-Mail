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
  useRef,
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
import { on_keys_ready } from "@/services/crypto/memory_key_store";

const ACTIVE_CATEGORY_KEY = "astermail_active_category";
const CATEGORIES_ENABLED_FLAG = "astermail_inbox_categories_enabled";

// Holds the last-resolved tab for the lifetime of the page session so remounts
// (navigating away and back) initialize synchronously with the correct tab
// instead of flashing "primary" before the vault-encrypted value loads.
let session_active_category: EmailCategory | null = null;

function read_categories_enabled_flag(): boolean | null {
  try {
    const value = localStorage.getItem(CATEGORIES_ENABLED_FLAG);

    if (value === "1") return true;
    if (value === "0") return false;
  } catch {}

  return null;
}

function write_categories_enabled_flag(enabled: boolean): void {
  try {
    localStorage.setItem(CATEGORIES_ENABLED_FLAG, enabled ? "1" : "0");
  } catch {}
}

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
  restored: boolean;
}

export function use_inbox_categories(
  current_view: string,
): UseInboxCategoriesReturn {
  const { preferences, has_loaded_from_server } = use_preferences();

  const initial_disabled_flag_ref = useRef(read_categories_enabled_flag());

  useEffect(() => {
    write_categories_enabled_flag(
      preferences.inbox_categories_enabled !== false,
    );
  }, [preferences.inbox_categories_enabled]);

  const pref_enabled = preferences.inbox_categories_enabled !== false;

  const resolved_enabled =
    !has_loaded_from_server && initial_disabled_flag_ref.current === false
      ? false
      : pref_enabled;

  const enabled =
    resolved_enabled &&
    (current_view === "inbox" || current_view === "");

  const [active_category, set_active_category_state] = useState<EmailCategory>(
    () => session_active_category ?? "primary",
  );

  const [restored, set_restored] = useState<boolean>(
    () => session_active_category !== null,
  );

  const stored_tab_loaded_ref = useRef(session_active_category !== null);

  const index_version = useSyncExternalStore(
    subscribe_index,
    get_index_version,
    get_index_version,
  );

  const counts = useMemo(() => get_counts(), [index_version]);

  // The last-viewed tab is persisted vault-encrypted (AES-256-GCM + HMAC), not
  // as plaintext, so it leaves no readable behavioral signal on disk. Because
  // decryption needs the in-memory keys, wait for on_keys_ready (fires
  // immediately when keys are already present) before reading, so a not-yet-
  // ready vault is never mistaken for "no stored tab".
  useEffect(() => {
    if (stored_tab_loaded_ref.current) {
      mark_category_seen(session_active_category ?? "primary");

      return;
    }

    let cancelled = false;

    const unsubscribe = on_keys_ready(() => {
      if (cancelled || stored_tab_loaded_ref.current) return;

      secure_retrieve<EmailCategory>(ACTIVE_CATEGORY_KEY)
        .then((stored) => {
          if (cancelled) return;
          const resolved: EmailCategory = is_tab(stored) ? stored : "primary";

          stored_tab_loaded_ref.current = true;
          session_active_category = resolved;
          set_active_category_state(resolved);
          mark_category_seen(resolved);
          set_restored(true);
        })
        .catch(() => {
          if (cancelled) return;
          stored_tab_loaded_ref.current = true;
          session_active_category = "primary";
          mark_category_seen("primary");
          set_restored(true);
        });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!stored_tab_loaded_ref.current) return;
    mark_category_seen(active_category);
  }, [enabled, active_category]);

  const set_active_category = useCallback((category: EmailCategory) => {
    session_active_category = category;
    set_active_category_state(category);
    void secure_store(ACTIVE_CATEGORY_KEY, category).catch(() => {});
  }, []);

  useEffect(() => {
    const handle_inbox_home = () => {
      set_active_category("primary");
    };

    window.addEventListener("astermail:inbox-home", handle_inbox_home);

    return () => {
      window.removeEventListener("astermail:inbox-home", handle_inbox_home);
    };
  }, [set_active_category]);

  return {
    enabled,
    active_category,
    set_active_category,
    counts,
    restored,
  };
}
