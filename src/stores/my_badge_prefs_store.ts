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
import { useEffect, useSyncExternalStore } from "react";

import {
  fetch_badge_preferences,
  type BadgePreferences,
} from "@/services/api/user";

let current: BadgePreferences | null = null;
let has_fetched = false;
let is_fetching = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function get_snapshot(): BadgePreferences | null {
  return current;
}

export function set_my_badge_prefs(prefs: BadgePreferences | null) {
  current = prefs;
  has_fetched = true;
  notify();
}

export function reset_my_badge_prefs() {
  current = null;
  has_fetched = false;
  is_fetching = false;
  notify();
}

async function ensure_loaded() {
  if (has_fetched || is_fetching) return;
  is_fetching = true;
  try {
    const res = await fetch_badge_preferences();

    if (res.data) {
      current = res.data;
    } else {
      current = null;
    }
    has_fetched = true;
  } catch {
    has_fetched = true;
  } finally {
    is_fetching = false;
    notify();
  }
}

export function use_my_badge_prefs(): BadgePreferences | null {
  const value = useSyncExternalStore(subscribe, get_snapshot, get_snapshot);

  useEffect(() => {
    void ensure_loaded();
  }, []);

  return value;
}
