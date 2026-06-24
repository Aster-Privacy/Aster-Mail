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
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { SettingsSection } from "@/components/settings/settings_panel";

export interface DynamicSearchEntry {
  label: string;
  section: SettingsSection;
  breadcrumb: string;
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

export function SearchRegistryProvider({ children }: { children: React.ReactNode }) {
  const [dynamic_entries, set_dynamic_entries] = useState<DynamicSearchEntry[]>([]);
  const id_counter = useRef(0);

  const register = (entries: DynamicSearchEntry[]) => {
    const id = ++id_counter.current;
    const tagged = entries.map((e) => ({ ...e, _reg_id: id }));
    set_dynamic_entries((prev) => [...prev, ...tagged]);
    return () => {
      set_dynamic_entries((prev) => prev.filter((e) => (e as typeof e & { _reg_id: number })._reg_id !== id));
    };
  };

  return (
    <SearchRegistryContext.Provider value={{ register, dynamic_entries }}>
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
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    const entries = items.map((item) => ({ ...item, section }));
    return register(entries);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
