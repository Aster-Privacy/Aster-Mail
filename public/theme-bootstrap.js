(function () {
  try {
    var pref = localStorage.getItem("astermail_theme");
    var is_dark =
      pref === "dark" ||
      pref === null ||
      (pref === "system" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    var DARK_DEFAULT = { bg: "#0a0a0a", border: "#2a2a2a", text: "#a1a1aa" };
    var THEME_COLORS = {
      purple: { bg: "#120e1a", border: "#2c2238", text: "#b39ecf" },
      green: { bg: "#0a1712", border: "#1e3a2d", text: "#9ecfb5" },
      rose: { bg: "#1a0d10", border: "#3a1f28", text: "#cf9eae" },
      orange: { bg: "#1a120a", border: "#3a2a17", text: "#d1ab7f" },
      teal: { bg: "#0a1717", border: "#1e3939", text: "#9ccec8" },
      indigo: { bg: "#131325", border: "#26283f", text: "#a5a8d9" },
      amber: { bg: "#171207", border: "#362a10", text: "#d4bd82" },
      cyan: { bg: "#07161a", border: "#163038", text: "#8fd0dd" },
      slate: { bg: "#101114", border: "#24272c", text: "#a8b0bb" },
      "aster-blue": { bg: "#0a1420", border: "#1f3350", text: "#9fc0e8" },
      lime: { bg: "#121607", border: "#2a3610", text: "#bdd482" },
      fuchsia: { bg: "#1a0c1a", border: "#3a1c34", text: "#cf94c1" },
      emerald: { bg: "#071510", border: "#1e4d31", text: "#8dd4a8" },
      pink: { bg: "#1a0a14", border: "#4d2140", text: "#d491ba" },
      black: { bg: "#000000", border: "#262626", text: "#a3a3a3" },
    };

    var cached = localStorage.getItem("aster_preferences_cache");
    var color_theme = null;

    if (cached) {
      color_theme = JSON.parse(cached).color_theme;
    }

    if (color_theme && THEME_COLORS[color_theme]) {
      document.documentElement.classList.add("theme-" + color_theme);
    }

    if (is_dark) {
      document.documentElement.classList.add("dark");

      var colors = (color_theme && THEME_COLORS[color_theme]) || DARK_DEFAULT;

      var root_style = document.documentElement.style;
      root_style.setProperty("--bg-secondary", colors.bg);
      root_style.setProperty("--border-secondary", colors.border);
      root_style.setProperty("--text-tertiary", colors.text);

      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", colors.bg);
    }
  } catch (e) {}
})();
