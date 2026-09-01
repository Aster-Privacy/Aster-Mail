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
import type { TranslationKey } from "@/lib/i18n/types";
import type { SettingsSection } from "@/components/settings/settings_content";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface DynamicSearchEntry {
  label: string;
  label_key?: TranslationKey;
  section: SettingsSection;
  breadcrumb: string;
  crumb_key?: TranslationKey;
  keywords?: string[];
}

interface SearchRegistryContextValue {
  register: (entries: DynamicSearchEntry[]) => () => void;
  dynamic_entries: DynamicSearchEntry[];
}

const SearchRegistryContext = createContext<SearchRegistryContextValue>({
  register: () => () => {},
  dynamic_entries: [],
});

export function SearchRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [dynamic_entries, set_dynamic_entries] = useState<DynamicSearchEntry[]>(
    [],
  );
  const id_counter = useRef(0);

  const register = useCallback((entries: DynamicSearchEntry[]) => {
    const id = ++id_counter.current;
    const tagged = entries.map((e) => ({ ...e, _reg_id: id }));

    set_dynamic_entries((prev) => [...prev, ...tagged]);

    return () => {
      set_dynamic_entries((prev) =>
        prev.filter(
          (e) => (e as typeof e & { _reg_id: number })._reg_id !== id,
        ),
      );
    };
  }, []);

  const context_value = useMemo(
    () => ({ register, dynamic_entries }),
    [register, dynamic_entries],
  );

  return (
    <SearchRegistryContext.Provider value={context_value}>
      {children}
    </SearchRegistryContext.Provider>
  );
}

export function use_search_registry() {
  return useContext(SearchRegistryContext);
}

// Drop this hook into any settings section component. Every entry
// you list here becomes instantly searchable - no other file to touch.
//
// Example (inside encryption_section.tsx):
//   use_register_search_items([
//     { label: "Export public key",  breadcrumb: "Encryption > Keys" },
//     { label: "Export private key", breadcrumb: "Encryption > Keys" },
//   ]);
export function use_register_search_items(
  section: SettingsSection,
  items: Array<{ label: string; breadcrumb: string; keywords?: string[] }>,
) {
  const { register } = useContext(SearchRegistryContext);
  const register_ref = useRef(register);
  const items_ref = useRef(items);

  register_ref.current = register;
  items_ref.current = items;

  const entries_key = items
    .map((item) => `${item.label}::${item.breadcrumb}`)
    .join("|");

  useEffect(() => {
    const entries = items_ref.current.map((item) => ({ ...item, section }));

    return register_ref.current(entries);
  }, [entries_key, section]);
}
