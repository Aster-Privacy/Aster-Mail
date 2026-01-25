export type StylePresetId =
  | "gmail"
  | "outlook"
  | "apple_mail"
  | "yahoo"
  | "custom";

export interface StylePresetColors {
  light: {
    accent: string;
    accent_hover: string;
  };
  dark: {
    accent: string;
    accent_hover: string;
  };
}

export interface StylePreset {
  id: StylePresetId;
  name: string;
  description: string;
  density: "Compact" | "Comfortable" | "Spacious";
  inbox_format: "split" | "full";
  email_view_mode: "popup" | "split";
  reading_pane_position: "right" | "bottom" | "hidden";
  show_profile_pictures: boolean;
  show_email_preview: boolean;
  split_pane_width: number;
  colors: StylePresetColors;
}
