export type SettingType = "toggle" | "select" | "text" | "info";

interface BaseSetting {
  label: string;
  value: string | boolean;
  key: string;
  type: SettingType;
  description: string;
}

export interface SelectSetting extends BaseSetting {
  type: "select";
  value: string;
  options: string[];
}

export interface ToggleSetting extends BaseSetting {
  type: "toggle";
  value: boolean;
}

export interface TextSetting extends BaseSetting {
  type: "text";
  value: string;
}

export interface InfoSetting extends BaseSetting {
  type: "info";
  value: string;
}

export type Setting = SelectSetting | ToggleSetting | TextSetting | InfoSetting;

export interface SettingsSection {
  title: string;
  description: string;
  settings?: Setting[];
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
