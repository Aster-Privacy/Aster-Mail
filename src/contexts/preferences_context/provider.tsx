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
import type {} from "@/lib/i18n/types";

import { useContext, useMemo } from "react";

import {
  PreferencesContext,
  PreferencesContextType,
  PreferencesProviderProps,
} from "./helpers";
import { use_preferences_provider } from "./use_preferences_provider";

export function PreferencesProvider({ children }: PreferencesProviderProps) {
  const {
    preferences,
    is_loading,
    has_loaded_from_server,
    save_status,
    update_preference,
    update_preferences,
    reset_to_defaults,
    reset_section,
    reload_preferences,
    save_now,
    has_unsaved_changes,
  } = use_preferences_provider();

  const value = useMemo<PreferencesContextType>(
    () => ({
      preferences,
      update_preference,
      update_preferences,
      reset_to_defaults,
      reset_section,
      save_now,
      reload_preferences,
      is_loading,
      has_loaded_from_server,
      save_status,
      has_unsaved_changes,
    }),
    [
      preferences,
      update_preference,
      update_preferences,
      reset_to_defaults,
      reset_section,
      save_now,
      reload_preferences,
      is_loading,
      has_loaded_from_server,
      save_status,
      has_unsaved_changes,
    ],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function use_preferences(): PreferencesContextType {
  const context = useContext(PreferencesContext);

  if (!context) {
    throw new Error("use_preferences must be used within PreferencesProvider");
  }

  return context;
}
