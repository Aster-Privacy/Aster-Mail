import { FC, useState, useEffect, useCallback } from "react";

import { SunFilledIcon, MoonFilledIcon } from "@/components/icons";
import { useTheme } from "@/contexts/theme_context";
import { use_preferences } from "@/contexts/preferences_context";

export interface theme_switch_props {
  class_name?: string;
}

export const theme_switch: FC<theme_switch_props> = ({ class_name }) => {
  const [is_mounted, set_is_mounted] = useState(false);
  const { theme, set_theme_preference } = useTheme();
  const { update_preference } = use_preferences();
  const is_light = theme === "light";

  useEffect(() => {
    set_is_mounted(true);
  }, []);

  const handle_toggle = useCallback(() => {
    const new_theme = theme === "light" ? "dark" : "light";

    set_theme_preference(new_theme);
    update_preference("theme", new_theme, true);
  }, [theme, set_theme_preference, update_preference]);

  if (!is_mounted) return <div className="h-6 w-6" />;

  return (
    <button
      aria-label={is_light ? "Switch to dark mode" : "Switch to light mode"}
      className={`px-px transition-opacity hover:opacity-80 cursor-pointer ${class_name || ""}`}
      onClick={handle_toggle}
    >
      <div className="w-auto h-auto bg-transparent rounded-lg flex items-center justify-center pt-px px-0 mx-0 text-[var(--text-muted)]">
        {is_light ? <MoonFilledIcon size={22} /> : <SunFilledIcon size={22} />}
      </div>
    </button>
  );
};
