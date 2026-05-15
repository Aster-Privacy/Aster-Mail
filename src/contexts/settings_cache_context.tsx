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
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type SettingsPanelName =
  | "auto_forward"
  | "blocked"
  | "allowlist"
  | "subscriptions"
  | "signature"
  | "templates"
  | "import"
  | "external_accounts"
  | "vacation_reply"
  | "ghost_aliases"
  | "aliases"
  | "sessions"
  | "recovery_email"
  | "preferences"
  | "trusted_devices";

export interface SettingsPanelEntry<T = unknown> {
  data: T | null;
  error: unknown;
  fetched_at: number;
  is_loading: boolean;
}

interface SettingsCacheValue {
  get_entry: <T>(panel: SettingsPanelName) => SettingsPanelEntry<T> | undefined;
  set_entry: <T>(
    panel: SettingsPanelName,
    entry: SettingsPanelEntry<T>,
  ) => void;
  invalidate: (panel?: SettingsPanelName) => void;
  is_fresh: (panel: SettingsPanelName, max_age_ms?: number) => boolean;
}

const SETTINGS_CACHE_FRESHNESS_MS = 30_000;

const SettingsCacheContext = createContext<SettingsCacheValue | null>(null);

export function SettingsCacheProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const store_ref = useRef<Map<SettingsPanelName, SettingsPanelEntry>>(
    new Map(),
  );
  const [, set_version] = useState(0);

  const bump = useCallback(() => set_version((v) => v + 1), []);

  const get_entry = useCallback(
    <T,>(panel: SettingsPanelName) =>
      store_ref.current.get(panel) as SettingsPanelEntry<T> | undefined,
    [],
  );

  const set_entry = useCallback(
    <T,>(panel: SettingsPanelName, entry: SettingsPanelEntry<T>) => {
      store_ref.current.set(panel, entry as SettingsPanelEntry);
      bump();
    },
    [bump],
  );

  const invalidate = useCallback(
    (panel?: SettingsPanelName) => {
      if (panel) {
        store_ref.current.delete(panel);
      } else {
        store_ref.current.clear();
      }
      bump();
    },
    [bump],
  );

  const is_fresh = useCallback(
    (panel: SettingsPanelName, max_age_ms = SETTINGS_CACHE_FRESHNESS_MS) => {
      const entry = store_ref.current.get(panel);

      if (!entry || entry.error) return false;

      return Date.now() - entry.fetched_at < max_age_ms;
    },
    [],
  );

  const value = useMemo<SettingsCacheValue>(
    () => ({ get_entry, set_entry, invalidate, is_fresh }),
    [get_entry, set_entry, invalidate, is_fresh],
  );

  return (
    <SettingsCacheContext.Provider value={value}>
      {children}
    </SettingsCacheContext.Provider>
  );
}

export function use_settings_cache(): SettingsCacheValue {
  const ctx = useContext(SettingsCacheContext);

  if (!ctx) {
    throw new Error(
      "use_settings_cache must be used within SettingsCacheProvider",
    );
  }

  return ctx;
}

export const SETTINGS_CACHE_FRESHNESS_WINDOW_MS = SETTINGS_CACHE_FRESHNESS_MS;
