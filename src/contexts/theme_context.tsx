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
  useContext,
  useEffect,
  useState,
  type ReactNode,
  useCallback,
} from "react";

import { update_status_bar_theme } from "@/native/capacitor_bridge";

export type Theme = "light" | "dark";
export type ThemePreference = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  theme_preference: ThemePreference;
  toggle_theme: () => void;
  set_theme: (theme: Theme) => void;
  set_theme_preference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "astermail_theme";

function get_system_theme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function get_initial_preference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);

    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }
  } catch {}

  if (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  ) {
    return "dark";
  }

  return "dark";
}

function resolve_theme(pref: ThemePreference): Theme {
  return pref === "system" ? get_system_theme() : pref;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme_preference, set_theme_preference_state] =
    useState<ThemePreference>(get_initial_preference);
  const [theme, set_theme_state] = useState<Theme>(() =>
    resolve_theme(get_initial_preference()),
  );

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    update_status_bar_theme(theme === "dark");

    const meta = document.querySelector('meta[name="theme-color"]');

    if (meta) {
      const bg = getComputedStyle(root).getPropertyValue("--bg-secondary").trim();

      if (bg) meta.setAttribute("content", bg);
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme_preference);
    } catch {}

    set_theme_state(resolve_theme(theme_preference));
  }, [theme_preference]);

  useEffect(() => {
    if (theme_preference !== "system" || typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const media_query = window.matchMedia("(prefers-color-scheme: dark)");
    const handle_change = () => {
      set_theme_state(media_query.matches ? "dark" : "light");
    };

    media_query.addEventListener("change", handle_change);

    return () => media_query.removeEventListener("change", handle_change);
  }, [theme_preference]);

  const toggle_theme = useCallback(() => {
    set_theme_preference_state((prev) => {
      const current = resolve_theme(prev);

      return current === "light" ? "dark" : "light";
    });
  }, []);

  const set_theme = useCallback((new_theme: Theme) => {
    set_theme_preference_state(new_theme);
  }, []);

  const set_theme_preference = useCallback((pref: ThemePreference) => {
    set_theme_preference_state(pref);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        theme_preference,
        toggle_theme,
        set_theme,
        set_theme_preference,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
