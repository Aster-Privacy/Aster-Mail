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

export const DEFAULT_FONT_ID = "default";

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

export function get_font_stack(id: string | undefined | null): string {
  return (
    FONT_OPTIONS_BY_ID.get(id ?? DEFAULT_FONT_ID)?.stack ??
    FONT_OPTIONS[0].stack
  );
}

export function is_valid_font_id(id: string): boolean {
  return FONT_OPTIONS_BY_ID.has(id);
}
