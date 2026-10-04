//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { css_color_to_hex } from "@/lib/avatar_color";
import { parse_css_color, rgba_to_hex } from "@/lib/email_contrast_repair";
import { relative_luminance } from "@/lib/email_ink";

interface PlaceholderSize {
  width: number;
  height: number;
  known: boolean;
}

function pixel_length(value: string | null): number | undefined {
  if (!value || !/^\d+(?:\.\d+)?(?:px)?$/.test(value.trim())) return;

  const number = Number.parseFloat(value);

  return Number.isFinite(number) ? number : undefined;
}

function placeholder_size(img: HTMLImageElement): PlaceholderSize {
  const width =
    pixel_length(img.style.width) ?? pixel_length(img.getAttribute("width"));
  const height =
    pixel_length(img.style.height) ?? pixel_length(img.getAttribute("height"));
  const ratio_match = img.style.aspectRatio.match(
    /^(?:auto\s+)?([\d.]+)(?:\s*\/\s*([\d.]+))?$/,
  );
  const ratio = ratio_match
    ? Number(ratio_match[1]) / Number(ratio_match[2] || 1)
    : undefined;

  if (width !== undefined && height !== undefined)
    return { width, height, known: true };
  if (ratio && Number.isFinite(ratio) && ratio > 0) {
    const w = width ?? (height ? height * ratio : 300);

    return { width: w, height: height ?? w / ratio, known: true };
  }

  return { width: width ?? 120, height: height ?? 24, known: false };
}

function xml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

export interface PlaceholderPaint {
  background: string;
  border: string;
  text: string;
  font: string;
  radius: number;
  background_opacity?: number;
  border_opacity?: number;
}

interface SurfaceTint {
  ink: string;
  background_opacity: number;
  border_opacity: number;
  text: string;
}

const LIGHT_SURFACE_TINT: SurfaceTint = {
  ink: "#000000",
  background_opacity: 0.04,
  border_opacity: 0.09,
  text: "#5c616d",
};

const DARK_SURFACE_TINT: SurfaceTint = {
  ink: "#ffffff",
  background_opacity: 0.06,
  border_opacity: 0.18,
  text: "#a3a3a3",
};

const LIGHT_SURFACE_MIN_LUMINANCE = 0.18;
const OPAQUE_SURFACE_MIN_ALPHA = 0.5;

export function placeholder_paint_for_surface(
  surface: string,
  base: PlaceholderPaint,
): PlaceholderPaint {
  const color = parse_css_color(surface);

  if (!color || color.a < OPAQUE_SURFACE_MIN_ALPHA) return base;
  const tint =
    relative_luminance(rgba_to_hex(color)) >= LIGHT_SURFACE_MIN_LUMINANCE
      ? LIGHT_SURFACE_TINT
      : DARK_SURFACE_TINT;

  return {
    ...base,
    background: tint.ink,
    background_opacity: tint.background_opacity,
    border: tint.ink,
    border_opacity: tint.border_opacity,
    text: tint.text,
  };
}

function surface_behind(
  img: Element,
  view: Window,
  known_surfaces: Map<Element, string | null>,
): string | null {
  const walked: Element[] = [];
  let surface: string | null = null;

  for (let el = img.parentElement; el; el = el.parentElement) {
    const known = known_surfaces.get(el);

    if (known !== undefined) {
      surface = known;
      break;
    }
    walked.push(el);
    const background = view.getComputedStyle(el).backgroundColor;
    const color = parse_css_color(background);

    if (color && color.a >= OPAQUE_SURFACE_MIN_ALPHA) {
      surface = background;
      break;
    }
  }
  for (const el of walked) known_surfaces.set(el, surface);

  return surface;
}

const LIGHT_PAINT: PlaceholderPaint = {
  background: "#f5f5f5",
  border: "#e8e8e8",
  text: "#5c616d",
  font: "'Google Sans Flex', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  radius: 10,
};

export function email_placeholder_paint(dark: boolean): PlaceholderPaint {
  const fallback = dark
    ? {
        ...LIGHT_PAINT,
        background: "#0a0a0a",
        border: "#333333",
        text: "#909090",
      }
    : LIGHT_PAINT;

  if (
    typeof document === "undefined" ||
    document.documentElement.classList.contains("dark") !== dark
  )
    return fallback;
  const styles = getComputedStyle(document.documentElement);
  const color = (variable: string, value: string) =>
    css_color_to_hex(styles.getPropertyValue(variable).trim()) || value;
  const raw_radius = styles.getPropertyValue("--radius").trim();
  const radius = Number.parseFloat(raw_radius);
  const root_font = Number.parseFloat(styles.fontSize) || 16;

  return {
    ...fallback,
    background: color("--bg-secondary", fallback.background),
    border: color("--border-primary", fallback.border),
    text: color("--text-muted", fallback.text),
    radius: Number.isFinite(radius)
      ? radius * (raw_radius.endsWith("rem") ? root_font : 1)
      : fallback.radius,
  };
}

const PHOTO_PATH =
  "m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z";

export interface BlockedImageLabels {
  image: string;
  tracking_pixel: string;
}

export const DEFAULT_BLOCKED_IMAGE_LABELS: BlockedImageLabels = {
  image: "Image blocked",
  tracking_pixel: "Tracking pixel blocked",
};

const LABEL_FONT_SIZE = 12;

function label_width(label: string): number {
  let width = 0;

  for (const character of label) {
    width +=
      (character.codePointAt(0) ?? 0) >= 0x1100
        ? LABEL_FONT_SIZE
        : LABEL_FONT_SIZE * 0.55;
  }

  return Math.ceil(width);
}

function placeholder_source(
  size: PlaceholderSize,
  viewport: { width: number; height: number },
  paint: PlaceholderPaint,
  label: string | null,
): string {
  const w = Math.max(viewport.width, 1);
  const h = Math.max(viewport.height, 1);
  const icon_size = Math.min(w < 100 || h < 36 ? 16 : 24, w - 4, h - 4);
  const stacked = h >= 64;
  const text_width = label ? label_width(label) : 0;
  const show_label =
    label !== null &&
    h >= 20 &&
    w >= 110 &&
    w >= (stacked ? text_width : icon_size + 8 + text_width) + 8;
  const group_width =
    show_label && !stacked ? icon_size + 8 + text_width : icon_size;
  const x = (w - group_width) / 2;
  const y =
    stacked && show_label ? (h - icon_size - 26) / 2 : (h - icon_size) / 2;
  const icon =
    icon_size > 0
      ? `<svg x="${x}" y="${y}" width="${icon_size}" height="${icon_size}" viewBox="0 0 24 24" fill="none" stroke="${xml(paint.text)}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${PHOTO_PATH}"/></svg>`
      : "";
  const text = show_label
    ? `<text x="${stacked ? w / 2 : x + icon_size + 8}" y="${stacked ? y + icon_size + 22 : h / 2 + 4}" text-anchor="${stacked ? "middle" : "start"}" font-family="${xml(paint.font)}" font-size="${LABEL_FONT_SIZE}" fill="${xml(paint.text)}">${xml(label!)}</text>`
    : "";
  const opacity = [
    paint.background_opacity === undefined
      ? ""
      : ` fill-opacity="${paint.background_opacity}"`,
    paint.border_opacity === undefined
      ? ""
      : ` stroke-opacity="${paint.border_opacity}"`,
  ].join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(size.width, 1)}" height="${Math.max(size.height, 1)}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><rect x="0.5" y="0.5" width="${Math.max(w - 1, 0)}" height="${Math.max(h - 1, 0)}" rx="${Math.min(paint.radius, w / 2, h / 2)}" fill="${xml(paint.background)}" stroke="${xml(paint.border)}"${opacity}/>${icon}${text}</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function is_tracking(img: Element): boolean {
  return img.getAttribute("data-tracking-pixel") === "true";
}

function svg_label(img: Element, labels: BlockedImageLabels): string | null {
  return is_tracking(img) ? null : labels.image;
}

function apply_label(img: Element, labels: BlockedImageLabels): void {
  const alt = img.getAttribute("alt");

  if (alt !== null && alt.trim() === "") return;
  const tracking = is_tracking(img);
  const label = tracking ? labels.tracking_pixel : labels.image;
  const value = alt && !tracking ? `${label}: ${alt}` : label;

  img.setAttribute("title", value);
  img.setAttribute("aria-label", value);
}

export function prepare_blocked_image(
  img: HTMLImageElement,
  tracking: boolean,
  labels: BlockedImageLabels = DEFAULT_BLOCKED_IMAGE_LABELS,
): void {
  const size = placeholder_size(img);

  for (const name of ["title", "aria-label"]) {
    const value = img.getAttribute(name);

    if (value !== null) img.setAttribute(`data-original-${name}`, value);
  }
  img.setAttribute("data-tracking-pixel", tracking ? "true" : "false");
  apply_label(img, labels);
  img.setAttribute("data-placeholder-width", String(size.width));
  img.setAttribute("data-placeholder-height", String(size.height));
  img.setAttribute("data-placeholder-size-known", String(size.known));
  img.classList.add("blocked-remote-image");
  img.setAttribute(
    "src",
    placeholder_source(size, size, LIGHT_PAINT, svg_label(img, labels)),
  );
}

export function clear_blocked_image(img: Element): void {
  if (!img.hasAttribute("data-placeholder-size-known")) return;

  for (const name of ["title", "aria-label"]) {
    const original = img.getAttribute(`data-original-${name}`);

    if (original === null) img.removeAttribute(name);
    else img.setAttribute(name, original);
    img.removeAttribute(`data-original-${name}`);
  }
  for (const name of ["width", "height", "size-known"]) {
    img.removeAttribute(`data-placeholder-${name}`);
  }
}

const REPAINT_DELAY_MS = 120;

export function paint_blocked_images(
  doc: Document,
  labels: BlockedImageLabels = DEFAULT_BLOCKED_IMAGE_LABELS,
): () => void {
  const view = doc.defaultView;

  if (!view) return () => {};
  const is_blocked = (img: Element) =>
    img.getAttribute("data-blocked") === "true" &&
    img.hasAttribute("data-placeholder-size-known");
  const paint = (images: Iterable<HTMLImageElement>) => {
    const zoom = Number.parseFloat(view.getComputedStyle(doc.body).zoom) || 1;
    const updates: [HTMLImageElement, string][] = [];
    const known_surfaces = new Map<Element, string | null>();

    for (const img of images) {
      if (!is_blocked(img)) {
        observer?.unobserve(img);
        continue;
      }
      const styles = view.getComputedStyle(img);
      const size = {
        width: Number(img.getAttribute("data-placeholder-width")) || 1,
        height: Number(img.getAttribute("data-placeholder-height")) || 1,
        known: img.getAttribute("data-placeholder-size-known") === "true",
      };
      const rect = img.getBoundingClientRect();
      const viewport = {
        width: rect.width > 0 ? Math.round(rect.width / zoom) : size.width,
        height: rect.height > 0 ? Math.round(rect.height / zoom) : size.height,
      };
      const value = (name: string, fallback: string) =>
        styles.getPropertyValue(name).trim() || fallback;
      const color = (name: string, fallback: string) =>
        css_color_to_hex(value(name, fallback)) || fallback;

      const themed: PlaceholderPaint = {
        background: color(
          "--aster-placeholder-background",
          LIGHT_PAINT.background,
        ),
        border: color("--aster-placeholder-border", LIGHT_PAINT.border),
        text: color("--aster-placeholder-text", LIGHT_PAINT.text),
        font: value("--aster-placeholder-font", LIGHT_PAINT.font),
        radius:
          Number.parseFloat(value("--aster-placeholder-radius", "10")) || 10,
      };
      const surface = surface_behind(img, view, known_surfaces);

      updates.push([
        img,
        placeholder_source(
          size,
          viewport,
          surface ? placeholder_paint_for_surface(surface, themed) : themed,
          svg_label(img, labels),
        ),
      ]);
    }
    for (const [img, source] of updates) {
      if (img.getAttribute("src") !== source) img.setAttribute("src", source);
    }
  };
  const pending = new Set<HTMLImageElement>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const batch = Array.from(pending);

    pending.clear();
    paint(batch);
  };
  const observer: ResizeObserver | null =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => {
          for (const entry of entries)
            pending.add(entry.target as HTMLImageElement);
          timer ??= setTimeout(flush, REPAINT_DELAY_MS);
        })
      : null;
  const images = Array.from(
    doc.querySelectorAll<HTMLImageElement>(
      "img.blocked-remote-image[data-placeholder-size-known]",
    ),
  );

  for (const img of images) {
    if (is_blocked(img)) apply_label(img, labels);
  }
  paint(images);
  for (const img of images) {
    if (is_blocked(img)) observer?.observe(img);
  }

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending.clear();
    view.removeEventListener("pagehide", dispose);
  };

  view.addEventListener("pagehide", dispose);

  return dispose;
}
