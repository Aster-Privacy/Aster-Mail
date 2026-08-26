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

export type HeadingLevel = "p" | "h1" | "h2" | "h3";
export type TextAlignment = "left" | "center" | "right" | "justify";
export type FontSizeLabel = "small" | "normal" | "large" | "huge";

export const FONT_SIZE_MAP: Record<FontSizeLabel, string> = {
  small: "12px",
  normal: "14px",
  large: "18px",
  huge: "24px",
};

export const FONT_SIZE_INDEX_MAP: Record<FontSizeLabel, string> = {
  small: "2",
  normal: "3",
  large: "5",
  huge: "7",
};

const FONT_ATTRIBUTES_HANDLED = new Set(["size", "color", "face", "style"]);

export function font_size_label_from_px(px: string): FontSizeLabel | null {
  const labels = Object.keys(FONT_SIZE_MAP) as FontSizeLabel[];

  return labels.find((label) => FONT_SIZE_MAP[label] === px) ?? null;
}

export function replace_font_element(
  font: HTMLElement,
  px: string,
): HTMLSpanElement {
  const span = document.createElement("span");

  if (font.style.cssText) {
    span.style.cssText = font.style.cssText;
  }

  Array.from(font.attributes).forEach((attribute) => {
    if (FONT_ATTRIBUTES_HANDLED.has(attribute.name)) return;

    span.setAttribute(attribute.name, attribute.value);
  });

  const color = font.getAttribute("color");

  if (color && !span.style.color) {
    span.style.color = color;
  }

  const face = font.getAttribute("face");

  if (face && !span.style.fontFamily) {
    span.style.fontFamily = face;
  }

  span.style.fontSize = px;

  while (font.firstChild) {
    span.appendChild(font.firstChild);
  }

  font.replaceWith(span);

  return span;
}

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$/;

export function validate_hex_color(color: string): boolean {
  return HEX_COLOR_REGEX.test(color);
}

export function get_closest_list(
  node: Node | null,
): HTMLUListElement | HTMLOListElement | null {
  if (!node) return null;

  let current: Node | null = node;

  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const tag = (current as HTMLElement).tagName;

      if (tag === "UL" || tag === "OL") {
        return current as HTMLUListElement | HTMLOListElement;
      }
    }
    current = current.parentNode;
  }

  return null;
}

export function is_inside_list(
  node: Node | null,
  list_type: "ul" | "ol",
): boolean {
  const list = get_closest_list(node);

  if (!list) return false;

  return list.tagName.toLowerCase() === list_type;
}

export function is_inside_tag(node: Node | null, tag_name: string): boolean {
  let current: Node | null = node;

  while (current) {
    if (
      current.nodeType === Node.ELEMENT_NODE &&
      (current as HTMLElement).tagName.toLowerCase() === tag_name.toLowerCase()
    ) {
      return true;
    }
    current = current.parentNode;
  }

  return false;
}

export function get_current_block_tag(node: Node | null): string {
  const block_tags = new Set([
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "div",
    "blockquote",
    "pre",
  ]);
  let current: Node | null = node;

  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const tag = (current as HTMLElement).tagName.toLowerCase();

      if (block_tags.has(tag)) {
        return tag;
      }
    }
    current = current.parentNode;
  }

  return "div";
}

export function escape_html(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const IMAGE_MAGIC_BYTES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/gif": [0x47, 0x49, 0x46],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

export function validate_image_magic_bytes(
  data: ArrayBuffer,
  mime_type: string,
): boolean {
  const expected = IMAGE_MAGIC_BYTES[mime_type];

  if (!expected) return false;

  const bytes = new Uint8Array(data.slice(0, expected.length));

  return expected.every((b, i) => bytes[i] === b);
}

export const MAX_PASTE_IMAGE_SIZE = 2 * 1024 * 1024;

export interface EditorFormatState {
  active_formats: Set<string>;
  current_heading: HeadingLevel;
  current_alignment: TextAlignment;
  is_in_blockquote: boolean;
  is_in_ordered_list: boolean;
  is_in_unordered_list: boolean;
  current_font_color: string;
  current_bg_color: string;
  current_font_size: string;
}

export interface UseEditorOptions {
  editor_ref: React.RefObject<HTMLDivElement | null>;
  on_change?: (html: string) => void;
  enable_rich_paste?: boolean;
  enable_keyboard_shortcuts?: boolean;
  is_plain_text_mode?: boolean;
  on_files_drop?: (files: File[]) => void;
  strip_exif_on_compose?: boolean;
  get_inline_image_budget?: () => number;
}

export interface ImageResizeState {
  image: HTMLImageElement | null;
  rect: DOMRect | null;
}

export interface UseEditorReturn {
  format_state: EditorFormatState;

  exec_format: (command: string, value?: string, use_css?: boolean) => void;
  toggle_bold: () => void;
  toggle_italic: () => void;
  toggle_underline: () => void;
  toggle_strikethrough: () => void;
  toggle_ordered_list: () => void;
  toggle_unordered_list: () => void;
  insert_blockquote: () => void;
  insert_horizontal_rule: () => boolean;
  set_heading: (level: HeadingLevel) => void;
  set_alignment: (alignment: TextAlignment) => void;
  remove_formatting: () => void;
  insert_link: (url: string, text?: string) => void;
  insert_emoji: (emoji: string) => void;
  insert_text: (text: string) => void;
  insert_html: (html: string) => void;
  apply_signature: (html: string | null) => void;
  set_font_color: (color: string) => void;
  set_background_color: (color: string) => void;
  set_font_size: (size: FontSizeLabel) => void;

  handle_paste: (e: React.ClipboardEvent) => void;
  handle_drop: (e: React.DragEvent) => void;
  handle_drag_over: (e: React.DragEvent) => void;
  handle_input: () => void;

  save_selection: () => void;
  restore_selection: () => void;

  get_html: () => string;
  set_html: (html: string) => void;
  focus: () => void;
  is_mac: boolean;

  selected_image: ImageResizeState;
  deselect_image: () => void;
  start_image_resize: (
    e: React.MouseEvent,
    handle: string,
    container_ref: React.RefObject<HTMLElement>,
  ) => void;
  delete_selected_image: () => void;
  set_image_width: (width: number) => void;
}
