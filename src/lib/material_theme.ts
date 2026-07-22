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

function srgb_to_linear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function linear_to_srgb(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function is_valid_hex_color(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

function hex_to_rgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const int_value = parseInt(expanded, 16);

  return [(int_value >> 16) & 255, (int_value >> 8) & 255, int_value & 255];
}

function rgb_to_hex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

  return `#${[r, g, b]
    .map((v) => clamp(v).toString(16).padStart(2, "0"))
    .join("")}`;
}

function linear_rgb_to_oklab(r: number, g: number, b: number) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklab_to_linear_rgb(L: number, a: number, b: number) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function oklab_to_oklch(L: number, a: number, b: number) {
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;

  if (H < 0) H += 360;

  return { L, C, H };
}

function oklch_to_oklab(L: number, C: number, H: number) {
  const hue_radians = (H * Math.PI) / 180;

  return { L, a: C * Math.cos(hue_radians), b: C * Math.sin(hue_radians) };
}

interface SeedHueChroma {
  hue: number;
  chroma: number;
}

function get_seed_hue_chroma(hex: string): SeedHueChroma {
  const [r, g, b] = hex_to_rgb(hex).map((v) => v / 255);
  const linear_r = srgb_to_linear(r);
  const linear_g = srgb_to_linear(g);
  const linear_b = srgb_to_linear(b);
  const { L, a, b: ob } = linear_rgb_to_oklab(linear_r, linear_g, linear_b);
  const { C, H } = oklab_to_oklch(L, a, ob);

  return { hue: H, chroma: C };
}

function tone_to_hex(hue: number, chroma: number, tone_percent: number): string {
  const target_l = Math.max(0, Math.min(100, tone_percent)) / 100;
  let working_chroma = chroma;

  for (let attempt = 0; attempt < 24; attempt++) {
    const { a, b } = oklch_to_oklab(target_l, working_chroma, hue);
    const { r, g, b: bl } = oklab_to_linear_rgb(target_l, a, b);
    const sr = linear_to_srgb(r);
    const sg = linear_to_srgb(g);
    const sb = linear_to_srgb(bl);
    const in_gamut =
      sr >= -0.001 && sr <= 1.001 && sg >= -0.001 && sg <= 1.001 && sb >= -0.001 && sb <= 1.001;

    if (in_gamut) {
      return rgb_to_hex(sr * 255, sg * 255, sb * 255);
    }

    working_chroma *= 0.9;
  }

  const { r, g, b: bl } = oklab_to_linear_rgb(target_l, 0, 0);

  return rgb_to_hex(
    linear_to_srgb(r) * 255,
    linear_to_srgb(g) * 255,
    linear_to_srgb(bl) * 255,
  );
}

export function mix_hex_srgb(hex: string, other: string, ratio: number): string {
  const [r1, g1, b1] = hex_to_rgb(hex);
  const [r2, g2, b2] = hex_to_rgb(other);

  return rgb_to_hex(
    r1 * ratio + r2 * (1 - ratio),
    g1 * ratio + g2 * (1 - ratio),
    b1 * ratio + b2 * (1 - ratio),
  );
}

export function hex_to_rgba(hex: string, alpha: number): string {
  const [r, g, b] = hex_to_rgb(hex);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface AccentDerivedVars {
  "--accent-mix-w70": string;
  "--accent-mix-w80": string;
  "--accent-mix-w85": string;
  "--accent-mix-b70": string;
  "--accent-mix-b75": string;
  "--accent-mix-b80": string;
  "--accent-mix-b85": string;
  "--accent-alpha-75": string;
}

export function derive_accent_vars(accent_hex: string): AccentDerivedVars {
  return {
    "--accent-mix-w70": mix_hex_srgb(accent_hex, "#ffffff", 0.7),
    "--accent-mix-w80": mix_hex_srgb(accent_hex, "#ffffff", 0.8),
    "--accent-mix-w85": mix_hex_srgb(accent_hex, "#ffffff", 0.85),
    "--accent-mix-b70": mix_hex_srgb(accent_hex, "#000000", 0.7),
    "--accent-mix-b75": mix_hex_srgb(accent_hex, "#000000", 0.75),
    "--accent-mix-b80": mix_hex_srgb(accent_hex, "#000000", 0.8),
    "--accent-mix-b85": mix_hex_srgb(accent_hex, "#000000", 0.85),
    "--accent-alpha-75": hex_to_rgba(accent_hex, 0.75),
  };
}

export const ACCENT_DERIVED_KEYS: (keyof AccentDerivedVars)[] = [
  "--accent-mix-w70",
  "--accent-mix-w80",
  "--accent-mix-w85",
  "--accent-mix-b70",
  "--accent-mix-b75",
  "--accent-mix-b80",
  "--accent-mix-b85",
  "--accent-alpha-75",
];

export interface MaterialThemeVars {
  "--bg-primary": string;
  "--bg-secondary": string;
  "--bg-tertiary": string;
  "--bg-hover": string;
  "--bg-selected": string;
  "--bg-card": string;
  "--border-primary": string;
  "--border-secondary": string;
  "--border-thread-divider": string;
  "--text-primary": string;
  "--text-secondary": string;
  "--text-tertiary": string;
  "--text-muted": string;
  "--accent-color": string;
  "--accent-color-hover": string;
  "--accent-blue": string;
  "--accent-blue-hover": string;
  "--avatar-bg": string;
  "--avatar-text": string;
  "--indicator-bg": string;
}

export const CUSTOM_THEME_ROLE_KEYS: (keyof MaterialThemeVars)[] = [
  "--accent-color",
  "--accent-color-hover",
  "--bg-primary",
  "--bg-secondary",
  "--text-primary",
  "--text-secondary",
  "--border-primary",
];

export type CustomThemeOverrides = Partial<Record<keyof MaterialThemeVars, string>>;

const DARK_BASE_VARS: MaterialThemeVars = {
  "--bg-primary": "#121212",
  "--bg-secondary": "#0a0a0a",
  "--bg-tertiary": "#121212",
  "--bg-hover": "#1a1a1a",
  "--bg-selected": "#142744",
  "--bg-card": "#121212",
  "--border-primary": "#333333",
  "--border-secondary": "#2a2a2a",
  "--border-thread-divider": "#333333",
  "--text-primary": "#f5f5f5",
  "--text-secondary": "#d4d4d4",
  "--text-tertiary": "#a1a1aa",
  "--text-muted": "#8a8a8a",
  "--accent-color": "#3b82f6",
  "--accent-color-hover": "#60a5fa",
  "--accent-blue": "#3b82f6",
  "--accent-blue-hover": "#60a5fa",
  "--avatar-bg": "#2a2a2a",
  "--avatar-text": "#9ca3af",
  "--indicator-bg": "#121212",
};

const LIGHT_BASE_VARS: MaterialThemeVars = {
  "--bg-primary": "#ffffff",
  "--bg-secondary": "#f5f5f5",
  "--bg-tertiary": "#f3f4f6",
  "--bg-hover": "#ececec",
  "--bg-selected": "#eff6ff",
  "--bg-card": "#ffffff",
  "--border-primary": "#e8e8e8",
  "--border-secondary": "#e5e7eb",
  "--border-thread-divider": "#e5e5e5",
  "--text-primary": "#111827",
  "--text-secondary": "#374151",
  "--text-tertiary": "#4b5563",
  "--text-muted": "#5f6470",
  "--accent-color": "#3b82f6",
  "--accent-color-hover": "#2563eb",
  "--accent-blue": "#3b82f6",
  "--accent-blue-hover": "#2563eb",
  "--avatar-bg": "#e5e7eb",
  "--avatar-text": "#6b7280",
  "--indicator-bg": "#ffffff",
};

export function generate_material_theme(
  seed_hex: string,
  is_dark: boolean,
): MaterialThemeVars {
  const { hue, chroma: seed_chroma } = get_seed_hue_chroma(seed_hex);
  const accent_chroma = Math.min(seed_chroma, 0.19);
  const base = is_dark ? DARK_BASE_VARS : LIGHT_BASE_VARS;
  const accent_color = tone_to_hex(hue, accent_chroma, is_dark ? 64 : 40);
  const accent_color_hover = tone_to_hex(hue, accent_chroma, is_dark ? 73 : 34);

  return {
    ...base,
    "--accent-color": accent_color,
    "--accent-color-hover": accent_color_hover,
    "--accent-blue": accent_color,
    "--accent-blue-hover": accent_color_hover,
  };
}

export function compute_custom_theme_vars(
  seed_hex: string,
  is_dark: boolean,
  overrides: CustomThemeOverrides | undefined,
): MaterialThemeVars {
  const base = generate_material_theme(seed_hex, is_dark);

  if (!overrides) return base;

  const merged = { ...base };

  for (const key of Object.keys(overrides) as (keyof MaterialThemeVars)[]) {
    const value = overrides[key];

    if (value && is_valid_hex_color(value)) {
      merged[key] = value;
    }
  }

  return merged;
}

function apply_vars_with_derived(vars: MaterialThemeVars): void {
  const root = document.documentElement;

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }

  const derived = derive_accent_vars(vars["--accent-color"]);

  for (const [key, value] of Object.entries(derived)) {
    root.style.setProperty(key, value);
  }
}

export function apply_material_theme(seed_hex: string, is_dark: boolean): void {
  if (typeof document === "undefined") return;

  apply_vars_with_derived(generate_material_theme(seed_hex, is_dark));
}

export function apply_custom_theme(
  seed_hex: string,
  is_dark: boolean,
  overrides: CustomThemeOverrides | undefined,
): void {
  if (typeof document === "undefined") return;

  apply_vars_with_derived(compute_custom_theme_vars(seed_hex, is_dark, overrides));
}

const MATERIAL_THEME_KEYS: (keyof MaterialThemeVars)[] = [
  "--bg-primary",
  "--bg-secondary",
  "--bg-tertiary",
  "--bg-hover",
  "--bg-selected",
  "--bg-card",
  "--border-primary",
  "--border-secondary",
  "--border-thread-divider",
  "--text-primary",
  "--text-secondary",
  "--text-tertiary",
  "--text-muted",
  "--accent-color",
  "--accent-color-hover",
  "--accent-blue",
  "--accent-blue-hover",
  "--avatar-bg",
  "--avatar-text",
  "--indicator-bg",
];

export function clear_material_theme(): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  for (const key of MATERIAL_THEME_KEYS) {
    root.style.removeProperty(key);
  }

  for (const key of ACCENT_DERIVED_KEYS) {
    root.style.removeProperty(key);
  }
}
