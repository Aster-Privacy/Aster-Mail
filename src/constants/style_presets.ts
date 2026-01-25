import type { StylePreset, StylePresetId } from "@/types/style_presets";

export const STYLE_PRESETS: Record<StylePresetId, StylePreset> = {
  gmail: {
    id: "gmail",
    name: "Gmail",
    description: "Clean and efficient layout",
    density: "Compact",
    inbox_format: "split",
    email_view_mode: "split",
    reading_pane_position: "right",
    show_profile_pictures: true,
    show_email_preview: true,
    split_pane_width: 400,
    colors: {
      light: {
        accent: "#1a73e8",
        accent_hover: "#1557b0",
      },
      dark: {
        accent: "#8ab4f8",
        accent_hover: "#aecbfa",
      },
    },
  },
  outlook: {
    id: "outlook",
    name: "Outlook",
    description: "Professional workspace style",
    density: "Comfortable",
    inbox_format: "split",
    email_view_mode: "split",
    reading_pane_position: "bottom",
    show_profile_pictures: true,
    show_email_preview: true,
    split_pane_width: 500,
    colors: {
      light: {
        accent: "#0078d4",
        accent_hover: "#106ebe",
      },
      dark: {
        accent: "#4cc2ff",
        accent_hover: "#6dd0ff",
      },
    },
  },
  apple_mail: {
    id: "apple_mail",
    name: "Apple Mail",
    description: "Minimalist and elegant",
    density: "Spacious",
    inbox_format: "split",
    email_view_mode: "split",
    reading_pane_position: "right",
    show_profile_pictures: false,
    show_email_preview: true,
    split_pane_width: 350,
    colors: {
      light: {
        accent: "#007aff",
        accent_hover: "#0066cc",
      },
      dark: {
        accent: "#0a84ff",
        accent_hover: "#409cff",
      },
    },
  },
  yahoo: {
    id: "yahoo",
    name: "Yahoo",
    description: "Bold and colorful",
    density: "Comfortable",
    inbox_format: "split",
    email_view_mode: "split",
    reading_pane_position: "right",
    show_profile_pictures: true,
    show_email_preview: true,
    split_pane_width: 450,
    colors: {
      light: {
        accent: "#6001d2",
        accent_hover: "#4a00a3",
      },
      dark: {
        accent: "#a855f7",
        accent_hover: "#c084fc",
      },
    },
  },
  custom: {
    id: "custom",
    name: "Custom",
    description: "Your personalized setup",
    density: "Comfortable",
    inbox_format: "split",
    email_view_mode: "split",
    reading_pane_position: "right",
    show_profile_pictures: true,
    show_email_preview: true,
    split_pane_width: 500,
    colors: {
      light: {
        accent: "#3b82f6",
        accent_hover: "#2563eb",
      },
      dark: {
        accent: "#3b82f6",
        accent_hover: "#60a5fa",
      },
    },
  },
};

export const PRESET_ORDER: StylePresetId[] = [
  "gmail",
  "outlook",
  "apple_mail",
  "yahoo",
  "custom",
];

export const ACCENT_COLOR_SWATCHES = [
  {
    name: "Blue",
    light: "#3b82f6",
    dark: "#3b82f6",
    light_hover: "#2563eb",
    dark_hover: "#60a5fa",
  },
  {
    name: "Gmail Blue",
    light: "#1a73e8",
    dark: "#8ab4f8",
    light_hover: "#1557b0",
    dark_hover: "#aecbfa",
  },
  {
    name: "Outlook Blue",
    light: "#0078d4",
    dark: "#4cc2ff",
    light_hover: "#106ebe",
    dark_hover: "#6dd0ff",
  },
  {
    name: "Apple Blue",
    light: "#007aff",
    dark: "#0a84ff",
    light_hover: "#0066cc",
    dark_hover: "#409cff",
  },
  {
    name: "Purple",
    light: "#6001d2",
    dark: "#a855f7",
    light_hover: "#4a00a3",
    dark_hover: "#c084fc",
  },
  {
    name: "Green",
    light: "#16a34a",
    dark: "#22c55e",
    light_hover: "#15803d",
    dark_hover: "#4ade80",
  },
  {
    name: "Orange",
    light: "#ea580c",
    dark: "#f97316",
    light_hover: "#c2410c",
    dark_hover: "#fb923c",
  },
  {
    name: "Pink",
    light: "#db2777",
    dark: "#ec4899",
    light_hover: "#be185d",
    dark_hover: "#f472b6",
  },
  {
    name: "Teal",
    light: "#0d9488",
    dark: "#14b8a6",
    light_hover: "#0f766e",
    dark_hover: "#2dd4bf",
  },
];

export const STYLE_AFFECTING_PREFERENCES = [
  "density",
  "inbox_format",
  "email_view_mode",
  "reading_pane_position",
  "show_profile_pictures",
  "show_email_preview",
  "split_pane_width",
  "accent_color",
  "accent_color_hover",
] as const;
