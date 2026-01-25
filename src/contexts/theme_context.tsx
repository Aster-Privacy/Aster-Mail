import type { EncryptedVault } from "@/services/crypto/key_manager";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  useCallback,
} from "react";

import { get_preferences } from "@/services/api/preferences";

type Theme = "light" | "dark";
type ThemePreference = "light" | "dark" | "auto";

interface ThemeContextType {
  theme: Theme;
  theme_preference: ThemePreference;
  toggle_theme: () => void;
  set_theme: (theme: Theme) => void;
  set_theme_preference: (pref: ThemePreference) => void;
  load_theme_from_preferences: (vault: EncryptedVault) => Promise<void>;
  reset_to_system: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "astermail_theme";

function get_system_theme(): Theme {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  return "light";
}

function get_stored_theme_preference(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(THEME_STORAGE_KEY);

  if (stored === "light" || stored === "dark" || stored === "auto") {
    return stored;
  }

  return null;
}

function get_initial_theme(): Theme {
  const stored_pref = get_stored_theme_preference();

  if (stored_pref === "light" || stored_pref === "dark") {
    return stored_pref;
  }

  return get_system_theme();
}

function get_initial_preference(): ThemePreference {
  return get_stored_theme_preference() || "auto";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme_preference, set_theme_preference_state] =
    useState<ThemePreference>(get_initial_preference);
  const [theme, set_theme_state] = useState<Theme>(get_initial_theme);

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    if (theme_preference !== "auto") return;

    const media_query = window.matchMedia("(prefers-color-scheme: dark)");
    const handle_change = (e: MediaQueryListEvent) => {
      set_theme_state(e.matches ? "dark" : "light");
    };

    media_query.addEventListener("change", handle_change);

    return () => media_query.removeEventListener("change", handle_change);
  }, [theme_preference]);

  const toggle_theme = useCallback(() => {
    set_theme_state((prev) => {
      const new_theme = prev === "light" ? "dark" : "light";

      set_theme_preference_state(new_theme);
      localStorage.setItem(THEME_STORAGE_KEY, new_theme);

      return new_theme;
    });
  }, []);

  const set_theme = useCallback((new_theme: Theme) => {
    set_theme_preference_state(new_theme);
    set_theme_state(new_theme);
    localStorage.setItem(THEME_STORAGE_KEY, new_theme);
  }, []);

  const set_theme_preference = useCallback((pref: ThemePreference) => {
    set_theme_preference_state(pref);
    localStorage.setItem(THEME_STORAGE_KEY, pref);
    if (pref === "auto") {
      set_theme_state(get_system_theme());
    } else {
      set_theme_state(pref);
    }
  }, []);

  const reset_to_system = useCallback(() => {
    set_theme_preference_state("auto");
    set_theme_state(get_system_theme());
    localStorage.setItem(THEME_STORAGE_KEY, "auto");
  }, []);

  const load_theme_from_preferences = useCallback(
    async (vault: EncryptedVault) => {
      const response = await get_preferences(vault);

      if (response.data) {
        const pref_theme: ThemePreference = response.data.theme;

        set_theme_preference(pref_theme);
      }
    },
    [set_theme_preference],
  );

  return (
    <ThemeContext.Provider
      value={{
        theme,
        theme_preference,
        toggle_theme,
        set_theme,
        set_theme_preference,
        load_theme_from_preferences,
        reset_to_system,
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
