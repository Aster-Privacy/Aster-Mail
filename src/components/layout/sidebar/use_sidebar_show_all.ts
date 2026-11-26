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
import { useCallback } from "react";

import { use_preferences } from "@/contexts/preferences_context";
import { cache_sidebar_state } from "@/services/api/preferences";

export type SidebarShowAllKey =
  | "sidebar_folders_show_all"
  | "sidebar_labels_show_all"
  | "sidebar_aliases_show_all";

export function use_sidebar_show_all() {
  const { preferences, update_preference } = use_preferences();

  const set_show_all = useCallback(
    (key: SidebarShowAllKey, value: boolean) => {
      cache_sidebar_state(key, value);
      update_preference(key, value, true);
    },
    [update_preference],
  );

  const set_folders_expanded = useCallback(
    (expanded: boolean) => set_show_all("sidebar_folders_show_all", expanded),
    [set_show_all],
  );

  const set_labels_expanded = useCallback(
    (expanded: boolean) => set_show_all("sidebar_labels_show_all", expanded),
    [set_show_all],
  );

  const set_aliases_expanded = useCallback(
    (expanded: boolean) => set_show_all("sidebar_aliases_show_all", expanded),
    [set_show_all],
  );

  return {
    folders_expanded: preferences.sidebar_folders_show_all === true,
    labels_expanded: preferences.sidebar_labels_show_all === true,
    aliases_expanded: preferences.sidebar_aliases_show_all === true,
    set_folders_expanded,
    set_labels_expanded,
    set_aliases_expanded,
  };
}
