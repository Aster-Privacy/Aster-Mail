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
export interface FontOption {
  id: string;
  label: string;
  stack: string;
}

interface WebfontSource {
  family: string;
  file_prefix: string;
  subsets: string[];
}

export const DEFAULT_FONT_ID = "default";

export const EMAIL_FONT_MATCH_APP_ID = "match_app";

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "default",
    label: "Aster Default",
    stack: "'Google Sans Flex', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: "system",
    label: "System UI",
    stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: "inter",
    label: "Inter",
    stack: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: "roboto",
    label: "Roboto",
    stack: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    id: "nunito",
    label: "Nunito",
    stack: "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: "merriweather",
    label: "Merriweather",
    stack: "'Merriweather', Georgia, serif",
  },
  {
    id: "lora",
    label: "Lora",
    stack: "'Lora', Georgia, serif",
  },
  {
    id: "system_mono",
    label: "System Mono",
    stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace",
  },
  {
    id: "jetbrains_mono",
    label: "JetBrains Mono",
    stack: "'JetBrains Mono', 'Courier New', Courier, monospace",
  },
  {
    id: "poppins",
    label: "Poppins",
    stack: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: "montserrat",
    label: "Montserrat",
    stack: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: "work_sans",
    label: "Work Sans",
    stack: "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: "ibm_plex_sans",
    label: "IBM Plex Sans",
    stack: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: "ibm_plex_mono",
    label: "IBM Plex Mono",
    stack: "'IBM Plex Mono', 'Courier New', Courier, monospace",
  },
  {
    id: "space_mono",
    label: "Space Mono",
    stack: "'Space Mono', 'Courier New', Courier, monospace",
  },
  {
    id: "playfair_display",
    label: "Playfair Display",
    stack: "'Playfair Display', Georgia, serif",
  },
  {
    id: "libre_baskerville",
    label: "Libre Baskerville",
    stack: "'Libre Baskerville', Georgia, serif",
  },
  {
    id: "pt_serif",
    label: "PT Serif",
    stack: "'PT Serif', Georgia, serif",
  },
  {
    id: "raleway",
    label: "Raleway",
    stack: "'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
];

const FONT_OPTIONS_BY_ID = new Map(FONT_OPTIONS.map((f) => [f.id, f]));

const SUBSET_UNICODE_RANGES: Record<string, string> = {
  latin:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  latinext:
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
  cyrillic: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
  cyrillicext:
    "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
};

const ALL_SUBSETS = ["latin", "latinext", "cyrillic", "cyrillicext"];
const LATIN_SUBSETS = ["latin", "latinext"];

const WEBFONT_SOURCES: Record<string, WebfontSource> = {
  inter: { family: "Inter", file_prefix: "Inter", subsets: ALL_SUBSETS },
  roboto: { family: "Roboto", file_prefix: "Roboto", subsets: ALL_SUBSETS },
  nunito: { family: "Nunito", file_prefix: "Nunito", subsets: ALL_SUBSETS },
  merriweather: {
    family: "Merriweather",
    file_prefix: "Merriweather",
    subsets: ALL_SUBSETS,
  },
  lora: { family: "Lora", file_prefix: "Lora", subsets: ALL_SUBSETS },
  jetbrains_mono: {
    family: "JetBrains Mono",
    file_prefix: "JetBrainsMono",
    subsets: ALL_SUBSETS,
  },
  poppins: { family: "Poppins", file_prefix: "Poppins", subsets: LATIN_SUBSETS },
  montserrat: {
    family: "Montserrat",
    file_prefix: "Montserrat",
    subsets: ALL_SUBSETS,
  },
  work_sans: {
    family: "Work Sans",
    file_prefix: "WorkSans",
    subsets: LATIN_SUBSETS,
  },
  ibm_plex_sans: {
    family: "IBM Plex Sans",
    file_prefix: "IBMPlexSans",
    subsets: ALL_SUBSETS,
  },
  ibm_plex_mono: {
    family: "IBM Plex Mono",
    file_prefix: "IBMPlexMono",
    subsets: ALL_SUBSETS,
  },
  space_mono: {
    family: "Space Mono",
    file_prefix: "SpaceMono",
    subsets: LATIN_SUBSETS,
  },
  playfair_display: {
    family: "Playfair Display",
    file_prefix: "PlayfairDisplay",
    subsets: ["latin", "latinext", "cyrillic"],
  },
  libre_baskerville: {
    family: "Libre Baskerville",
    file_prefix: "LibreBaskerville",
    subsets: LATIN_SUBSETS,
  },
  pt_serif: { family: "PT Serif", file_prefix: "PTSerif", subsets: ALL_SUBSETS },
  raleway: { family: "Raleway", file_prefix: "Raleway", subsets: ALL_SUBSETS },
};

export function build_font_face_css(id: string | undefined | null): string {
  const source = WEBFONT_SOURCES[id ?? ""];

  if (!source) return "";

  return source.subsets
    .map(
      (subset) => `@font-face {
  font-family: '${source.family}';
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url('/fonts/${source.file_prefix}-${subset}.woff2') format('woff2');
  unicode-range: ${SUBSET_UNICODE_RANGES[subset]};
}`,
    )
    .join("\n");
}

export function get_font_stack(id: string | undefined | null): string {
  return (
    FONT_OPTIONS_BY_ID.get(id ?? DEFAULT_FONT_ID)?.stack ??
    FONT_OPTIONS[0].stack
  );
}

export function get_email_font_stack(
  email_font_id: string | undefined | null,
  app_font_id: string | undefined | null,
): string {
  const id = email_font_id ?? EMAIL_FONT_MATCH_APP_ID;

  if (id === EMAIL_FONT_MATCH_APP_ID) return get_font_stack(app_font_id);

  return get_font_stack(id);
}

export function is_email_font_override(
  email_font_id: string | undefined | null,
): boolean {
  const id = email_font_id ?? EMAIL_FONT_MATCH_APP_ID;

  return id !== EMAIL_FONT_MATCH_APP_ID && FONT_OPTIONS_BY_ID.has(id);
}

export function is_valid_font_id(id: string): boolean {
  return FONT_OPTIONS_BY_ID.has(id);
}
