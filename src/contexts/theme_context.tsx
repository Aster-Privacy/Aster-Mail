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

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  theme_preference: Theme;
  toggle_theme: () => void;
  set_theme: (theme: Theme) => void;
  set_theme_preference: (pref: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "astermail_theme";

function get_initial_theme(): Theme {
  if (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  ) {
    return "dark";
  }
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);

    if (stored === "dark" || stored === "light") return stored;
  } catch {}

  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, set_theme_state] = useState<Theme>(get_initial_theme);

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}

    update_status_bar_theme(theme === "dark");
  }, [theme]);

  const toggle_theme = useCallback(() => {
    set_theme_state((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const set_theme = useCallback((new_theme: Theme) => {
    set_theme_state(new_theme);
  }, []);

  const set_theme_preference = useCallback((pref: Theme) => {
    set_theme_state(pref);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        theme_preference: theme,
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
