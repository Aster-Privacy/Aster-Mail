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
import {
  BODY_TEXT_CONTRAST,
  LARGE_TEXT_CONTRAST,
  adjust_lightness_for_contrast,
  contrast_ratio,
  derive_link_hover_ink,
  derive_visited_ink,
  hex_to_hsl,
  hsl_to_hex,
  normalize_hex,
  relative_luminance,
} from "@/lib/email_ink";
import { oklch_lightness_chroma } from "@/lib/material_theme";

export const BORDER_MIN_CONTRAST = 1.35;
export const LARGE_TEXT_MIN_PX = 24;
export const LARGE_BOLD_MIN_PX = 18.66;
export const BOLD_MIN_WEIGHT = 700;
export const MAX_REPAIR_ELEMENTS = 20000;

export const NEUTRAL_CHROMA = 0.04;
export const NEAR_BLACK_CHROMA = 0.12;
export const NEAR_BLACK_LIGHTNESS = 0.22;
export const CAST_VISIBLE_LIGHTNESS = 0.4;

export const LINK_HOVER_VAR = "--aster-link-hover";
export const LINK_VISITED_VAR = "--aster-link-visited";
export const LINK_INK_ATTRIBUTE = "data-aster-ink";
export const LINK_INK_LAYER_ATTRIBUTE = "data-aster-ink-layer";
export const MEASURING_ATTRIBUTE = "data-aster-measuring";

const LINK_INK_SUFFIX = Array.from(
  crypto.getRandomValues(new Uint8Array(8)),
  (byte) => byte.toString(16).padStart(2, "0"),
).join("");

export const LINK_INK_LAYER = `aster-ink-${LINK_INK_SUFFIX}`;
export const LINK_INK_VAR = `--aster-link-ink-${LINK_INK_SUFFIX}`;
export const LINK_INK_HOVER_VAR = `--aster-link-hover-${LINK_INK_SUFFIX}`;
export const LINK_INK_VISITED_VAR = `--aster-link-visited-${LINK_INK_SUFFIX}`;

export const HIDDEN_LINK_ALPHA = 0.1;

const FALLBACK_SURFACE = "#121212";
const WHITE = "#ffffff";
const BLACK = "#000000";
const WHITE_RGBA: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const BLACK_RGBA: Rgba = { r: 0, g: 0, b: 0, a: 1 };

const NAMED_COLORS: Record<string, string> = {
  aqua: "#00ffff",
  black: "#000000",
  blue: "#0000ff",
  fuchsia: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  green: "#008000",
  lime: "#00ff00",
  maroon: "#800000",
  navy: "#000080",
  olive: "#808000",
  orange: "#ffa500",
  purple: "#800080",
  red: "#ff0000",
  silver: "#c0c0c0",
  teal: "#008080",
  white: "#ffffff",
  yellow: "#ffff00",
};

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "TITLE",
  "BASE",
  "NOSCRIPT",
  "TEMPLATE",
  "IMG",
  "PICTURE",
  "SOURCE",
  "SVG",
  "VIDEO",
  "AUDIO",
  "CANVAS",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "MAP",
  "AREA",
  "BR",
  "WBR",
]);

const CHROME_CLASS_PATTERN =
  /(?:^|\s)(?:aster-quote-toggle|blocked-image|blocked-remote-image|remote-content-banner)(?:$|\s)/;

const TRANSPARENT_KEYWORDS = new Set([
  "",
  "transparent",
  "none",
  "initial",
  "inherit",
  "unset",
  "revert",
  "currentcolor",
  "auto",
]);

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

function clamp_channel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function parse_hex_color(value: string): Rgba | null {
  const body = value.slice(1);

  if (!/^[0-9a-f]+$/i.test(body)) return null;

  const expand = (part: string) => Number.parseInt(part.repeat(2), 16);

  if (body.length === 3 || body.length === 4) {
    return {
      r: expand(body[0]),
      g: expand(body[1]),
      b: expand(body[2]),
      a: body.length === 4 ? expand(body[3]) / 255 : 1,
    };
  }

  if (body.length === 6 || body.length === 8) {
    const n = Number.parseInt(body.slice(0, 6), 16);

    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: body.length === 8 ? Number.parseInt(body.slice(6, 8), 16) / 255 : 1,
    };
  }

  return null;
}

function parse_alpha(raw: string | undefined): number {
  if (raw === undefined) return 1;

  const parsed = Number.parseFloat(raw);

  if (!Number.isFinite(parsed)) return 1;

  return Math.max(0, Math.min(1, raw.endsWith("%") ? parsed / 100 : parsed));
}

function hsl_components_to_rgba(
  h: number,
  s: number,
  l: number,
  a: number,
): Rgba {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[Math.floor(hp) % 6] ?? [0, 0, 0];

  return {
    r: clamp_channel((r + m) * 255),
    g: clamp_channel((g + m) * 255),
    b: clamp_channel((b + m) * 255),
    a,
  };
}

const MEMO_LIMIT = 4096;

function memoize<T>(cache: Map<string, T>, key: string, compute: () => T): T {
  const hit = cache.get(key);

  if (hit !== undefined) return hit;

  const value = compute();

  if (cache.size >= MEMO_LIMIT) cache.clear();
  cache.set(key, value);

  return value;
}

const parse_cache = new Map<string, Rgba | null>();
const repair_cache = new Map<string, string>();
const text_repair_cache = new Map<string, string>();
const hover_cache = new Map<string, string>();
const visited_cache = new Map<string, string>();

export function parse_css_color(input: string | null | undefined): Rgba | null {
  if (!input) return null;

  return memoize(parse_cache, input, () => parse_css_color_uncached(input));
}

function parse_css_color_uncached(input: string): Rgba | null {
  const value = input.trim().toLowerCase();

  if (TRANSPARENT_KEYWORDS.has(value)) {
    return value === "" ? null : TRANSPARENT;
  }

  if (value.startsWith("#")) return parse_hex_color(value);

  const named = NAMED_COLORS[value];

  if (named) return parse_hex_color(named);

  const srgb = value.match(/^color\(\s*srgb\s([^)]*)\)$/);

  if (srgb) return parse_srgb_function(srgb[1]);

  const fn = value.match(/^(rgba?|hsla?)\((.*)\)$/);

  if (!fn) return null;

  const parts = fn[2]
    .replace(/\//g, " ")
    .split(/[\s,]+/)
    .filter(Boolean);

  if (parts.length < 3) return null;

  const alpha = parse_alpha(parts[3]);

  if (fn[1].startsWith("hsl")) {
    const h = Number.parseFloat(parts[0]);
    const s = Number.parseFloat(parts[1]) / 100;
    const l = Number.parseFloat(parts[2]) / 100;

    if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) {
      return null;
    }

    return hsl_components_to_rgba(
      h,
      Math.max(0, Math.min(1, s)),
      Math.max(0, Math.min(1, l)),
      alpha,
    );
  }

  const channels = parts.slice(0, 3).map((part) => {
    const parsed = Number.parseFloat(part);

    if (!Number.isFinite(parsed)) return Number.NaN;

    return clamp_channel(part.endsWith("%") ? (parsed / 100) * 255 : parsed);
  });

  if (channels.some((channel) => Number.isNaN(channel))) return null;

  return { r: channels[0], g: channels[1], b: channels[2], a: alpha };
}

function parse_srgb_function(body: string): Rgba | null {
  const parts = body.replace(/\//g, " ").split(/\s+/).filter(Boolean);

  if (parts.length < 3 || parts.includes("none")) return null;

  const channels = parts.slice(0, 3).map((part) => {
    const parsed = Number.parseFloat(part);

    return part.endsWith("%") ? parsed / 100 : parsed;
  });

  if (channels.some((channel) => !Number.isFinite(channel))) return null;

  return {
    r: clamp_channel(channels[0] * 255),
    g: clamp_channel(channels[1] * 255),
    b: clamp_channel(channels[2] * 255),
    a: parse_alpha(parts[3]),
  };
}

export function composite_over(source: Rgba, backdrop: Rgba): Rgba {
  if (source.a >= 1) return { ...source, a: 1 };

  const a = source.a;

  return {
    r: source.r * a + backdrop.r * (1 - a),
    g: source.g * a + backdrop.g * (1 - a),
    b: source.b * a + backdrop.b * (1 - a),
    a: 1,
  };
}

export function rgba_to_hex(color: Rgba): string {
  const channel = (value: number) =>
    Math.round(clamp_channel(value)).toString(16).padStart(2, "0");

  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

const LIGHTNESS_STEP = 0.01;

export function repair_lightness(
  color: string,
  background: string,
  target: number,
): string {
  return memoize(repair_cache, `${color}|${background}|${target}`, () =>
    repair_lightness_uncached(color, background, target),
  );
}

function repair_lightness_uncached(
  color: string,
  background: string,
  target: number,
): string {
  const preferred = adjust_lightness_for_contrast(color, background, target);

  if (contrast_ratio(preferred, background) >= target) return preferred;

  const hsl = hex_to_hsl(color);
  const lighten = relative_luminance(background) >= 0.5;
  let fallback = preferred;
  let fallback_ratio = contrast_ratio(preferred, background);

  for (
    let l = hsl.l;
    lighten ? l <= 1 : l >= 0;
    l += lighten ? LIGHTNESS_STEP : -LIGHTNESS_STEP
  ) {
    const candidate = hsl_to_hex({
      ...hsl,
      l: Math.max(0, Math.min(1, l)),
    });
    const ratio = contrast_ratio(candidate, background);

    if (ratio >= target) return candidate;
    if (ratio > fallback_ratio) {
      fallback_ratio = ratio;
      fallback = candidate;
    }
  }

  return fallback;
}

export function is_neutral_ink(color: string): boolean {
  const hex = normalize_hex(color);

  if (!hex) return false;

  const { lightness, chroma } = oklch_lightness_chroma(hex);
  const darkness = Math.max(
    0,
    Math.min(
      1,
      (CAST_VISIBLE_LIGHTNESS - lightness) /
        (CAST_VISIBLE_LIGHTNESS - NEAR_BLACK_LIGHTNESS),
    ),
  );

  return (
    chroma < NEUTRAL_CHROMA + darkness * (NEAR_BLACK_CHROMA - NEUTRAL_CHROMA)
  );
}

function grey_hex(channel: number): string {
  const part = Math.round(clamp_channel(channel)).toString(16).padStart(2, "0");

  return `#${part}${part}${part}`;
}

function grey_for_contrast(
  background: string,
  target: number,
  lighten: boolean,
): string {
  const backdrop = relative_luminance(background);
  const wanted = lighten
    ? target * (backdrop + 0.05) - 0.05
    : (backdrop + 0.05) / target - 0.05;
  const luminance = Math.max(0, Math.min(1, wanted));
  const encoded =
    luminance <= 0.03928 / 12.92
      ? luminance * 12.92
      : 1.055 * Math.pow(luminance, 1 / 2.4) - 0.055;
  let channel = Math.round(encoded * 255);

  while (
    (lighten ? channel < 255 : channel > 0) &&
    contrast_ratio(grey_hex(channel), background) < target
  ) {
    channel += lighten ? 1 : -1;
  }

  return grey_hex(channel);
}

function ink_in_direction(
  ink: string | null,
  background: string,
  lighten: boolean,
): string | null {
  const hex = normalize_hex(ink);

  if (!hex) return null;

  const lighter = relative_luminance(hex) > relative_luminance(background);

  return lighter === lighten ? hex : null;
}

function repair_text_ink(
  source: Rgba,
  background: string,
  target: number,
  ink: string | null,
  on_canvas: boolean,
): string {
  return memoize(
    text_repair_cache,
    `${source.r},${source.g},${source.b},${source.a}|${background}|${target}|${ink ?? ""}|${on_canvas ? 1 : 0}`,
    () => repair_text_ink_uncached(source, background, target, ink, on_canvas),
  );
}

function repair_text_ink_uncached(
  source: Rgba,
  background: string,
  target: number,
  ink: string | null,
  on_canvas: boolean,
): string {
  const backdrop = parse_css_color(background) ?? BLACK_RGBA;
  const color = rgba_to_hex(composite_over(source, backdrop));

  if (!is_neutral_ink(color))
    return repair_lightness(color, background, target);

  const lighten =
    contrast_ratio(WHITE, background) >= contrast_ratio(BLACK, background);

  if (!on_canvas) return grey_for_contrast(background, target, lighten);

  const pole = lighten ? WHITE : BLACK;
  const designed = rgba_to_hex(
    composite_over(source, lighten ? WHITE_RGBA : BLACK_RGBA),
  );
  const ceiling = ink_in_direction(ink, background, lighten) ?? pole;
  const wanted = Math.max(
    target,
    Math.min(
      contrast_ratio(designed, pole),
      contrast_ratio(ceiling, background),
    ),
  );

  return grey_for_contrast(background, wanted, lighten);
}

export function contrast_threshold_for(
  font_size_px: number,
  font_weight: number,
): number {
  if (font_size_px >= LARGE_TEXT_MIN_PX) return LARGE_TEXT_CONTRAST;
  if (font_size_px >= LARGE_BOLD_MIN_PX && font_weight >= BOLD_MIN_WEIGHT) {
    return LARGE_TEXT_CONTRAST;
  }

  return BODY_TEXT_CONTRAST;
}

function parse_font_weight(value: string): number {
  if (value === "bold" || value === "bolder") return 700;

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 400;
}

function parse_px(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function has_own_text(element: Element): boolean {
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType !== 3) continue;
    if ((node.nodeValue ?? "").trim().length > 0) return true;
  }

  return false;
}

interface BackgroundState {
  hex: string;
  rgba: Rgba;
  authored: boolean;
}

function make_state(hex: string, authored = false): BackgroundState {
  const rgba = parse_css_color(hex) ?? { r: 18, g: 18, b: 18, a: 1 };

  return { hex, rgba, authored };
}

interface InheritedRepair {
  from: string;
  to: string;
}

interface TextPlan {
  element: HTMLElement;
  color: string | null;
  color_important: boolean;
  use_layer: boolean;
  border: string | null;
  hover: string | null;
  visited: string | null;
}

export interface ContrastRepairOptions {
  surface: string;
  ink?: string | null;
  view?: Window | null;
  max_elements?: number;
  repair_borders?: boolean;
}

export interface ContrastRepairStats {
  scanned: number;
  text_repaired: number;
  border_repaired: number;
  links_tuned: number;
  skipped_over_limit: boolean;
  elapsed_ms: number;
}

const BORDER_SIDES = ["Top", "Right", "Bottom", "Left"] as const;

function repaired_border_color(
  style: CSSStyleDeclaration,
  background: BackgroundState,
): string | null {
  let worst: string | null = null;
  let worst_ratio = Number.POSITIVE_INFINITY;

  for (const side of BORDER_SIDES) {
    const border_style = style.getPropertyValue(
      `border-${side.toLowerCase()}-style`,
    );

    if (!border_style || border_style === "none" || border_style === "hidden") {
      continue;
    }

    const width = parse_px(
      style.getPropertyValue(`border-${side.toLowerCase()}-width`),
      0,
    );

    if (width <= 0) continue;

    const parsed = parse_css_color(
      style.getPropertyValue(`border-${side.toLowerCase()}-color`),
    );

    if (!parsed || parsed.a === 0) continue;

    const hex = rgba_to_hex(composite_over(parsed, background.rgba));
    const ratio = contrast_ratio(hex, background.hex);

    if (ratio < worst_ratio) {
      worst_ratio = ratio;
      worst = hex;
    }
  }

  if (!worst || worst_ratio >= BORDER_MIN_CONTRAST) return null;

  const repaired = repair_lightness(worst, background.hex, BORDER_MIN_CONTRAST);

  return repaired === worst ? null : repaired;
}

function is_button_link(style: CSSStyleDeclaration): boolean {
  const background_image = style.getPropertyValue("background-image");

  if (background_image && background_image !== "none") return true;

  const background = parse_css_color(
    style.getPropertyValue("background-color"),
  );

  return !!background && background.a > 0;
}

const LINK_INK_LINK = `a[${LINK_INK_ATTRIBUTE}]`;

export const LINK_INK_LAYER_CSS = `@layer ${LINK_INK_LAYER} {
${LINK_INK_LINK} { color: var(${LINK_INK_VAR}) !important; transition: none !important; }
${LINK_INK_LINK}:visited { color: var(${LINK_INK_VISITED_VAR}, var(${LINK_INK_VAR})) !important; }
${LINK_INK_LINK}:hover { color: var(${LINK_INK_HOVER_VAR}, var(${LINK_INK_VAR})) !important; }
}`;

function add_link_ink_layer(doc: Document): void {
  const parent = doc.head ?? doc.documentElement;

  if (parent.querySelector(`style[${LINK_INK_LAYER_ATTRIBUTE}]`)) return;

  const style = doc.createElement("style");

  style.setAttribute(LINK_INK_LAYER_ATTRIBUTE, "");
  style.textContent = LINK_INK_LAYER_CSS;
  parent.insertBefore(style, parent.firstChild);
}

export function repair_email_contrast(
  doc: Document,
  options: ContrastRepairOptions,
): ContrastRepairStats {
  const started =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const stats: ContrastRepairStats = {
    scanned: 0,
    text_repaired: 0,
    border_repaired: 0,
    links_tuned: 0,
    skipped_over_limit: false,
    elapsed_ms: 0,
  };
  const view = options.view ?? doc.defaultView;
  const root = doc.body;

  if (!view || !root) return stats;

  const surface_hex = normalize_hex(options.surface) ?? FALLBACK_SURFACE;
  const surface_state = make_state(surface_hex);
  const image_state = make_state(surface_hex, true);
  const ink = options.ink ?? null;
  const limit = options.max_elements ?? MAX_REPAIR_ELEMENTS;
  const elements = doc.querySelectorAll<HTMLElement>("body, body *");

  stats.scanned = elements.length;

  if (elements.length > limit) {
    stats.skipped_over_limit = true;
    stats.elapsed_ms =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      started;

    return stats;
  }

  const backgrounds = new Map<Element, BackgroundState>();
  const inherited_repairs = new Map<Element, InheritedRepair>();
  const plans: TextPlan[] = [];
  const repair_borders = options.repair_borders !== false;

  const hovered = Array.from(doc.querySelectorAll<HTMLElement>("a:hover"));

  for (let index = 0; index < hovered.length; index += 1) {
    hovered[index].setAttribute(MEASURING_ATTRIBUTE, "");
  }

  try {
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const parent = element.parentElement;
      const parent_state =
        (parent ? backgrounds.get(parent) : undefined) ?? surface_state;
      const style = view.getComputedStyle(element);
      const background_image = style.getPropertyValue("background-image");
      const own_background = parse_css_color(
        style.getPropertyValue("background-color"),
      );

      let state = parent_state;

      if (background_image && background_image !== "none") {
        state = image_state;
      } else if (own_background && own_background.a > 0) {
        state = make_state(
          rgba_to_hex(composite_over(own_background, parent_state.rgba)),
          own_background.a >= 1 || parent_state.authored,
        );
      }

      backgrounds.set(element, state);

      const computed_color = style.getPropertyValue("color");
      const parent_repair = parent ? inherited_repairs.get(parent) : undefined;
      const inherited_repair =
        parent_repair && parent_repair.from === computed_color
          ? parent_repair
          : undefined;

      if (inherited_repair) inherited_repairs.set(element, inherited_repair);

      const tag = element.tagName;

      if (SKIP_TAGS.has(tag)) continue;

      const class_name = element.getAttribute("class");

      if (class_name && CHROME_CLASS_PATTERN.test(class_name)) continue;

      const is_link = tag === "A" && !is_button_link(style);

      if (tag === "A" && !is_link) continue;

      const paints_text = is_link || has_own_text(element);
      const border = repair_borders
        ? repaired_border_color(style, state)
        : null;

      if (!paints_text && !border) continue;

      let repaired_color: string | null = null;
      let final_color: string | null = null;

      if (paints_text) {
        const parsed = parse_css_color(computed_color);
        const hidden_link = is_link && !!parsed && parsed.a < HIDDEN_LINK_ALPHA;

        if (parsed && !hidden_link) {
          const composited = rgba_to_hex(composite_over(parsed, state.rgba));
          const threshold = contrast_threshold_for(
            parse_px(style.getPropertyValue("font-size"), 16),
            parse_font_weight(style.getPropertyValue("font-weight")),
          );

          final_color = composited;

          if (contrast_ratio(composited, state.hex) < threshold) {
            const next = repair_text_ink(
              parsed,
              state.hex,
              threshold,
              ink,
              !state.authored,
            );

            if (next !== composited) {
              repaired_color = next;
              final_color = next;
            }
          } else if (
            inherited_repair &&
            contrast_ratio(inherited_repair.to, state.hex) < threshold
          ) {
            repaired_color = composited;
          }

          if (repaired_color) {
            inherited_repairs.set(element, {
              from: computed_color,
              to: repaired_color,
            });
          }
        }
      }

      let hover: string | null = null;
      let visited: string | null = null;

      if (is_link && final_color) {
        const ink_key = `${final_color}|${state.hex}`;

        hover = memoize(hover_cache, ink_key, () =>
          derive_link_hover_ink(final_color as string, state.hex),
        );
        visited = memoize(visited_cache, ink_key, () =>
          derive_visited_ink(final_color as string, state.hex),
        );
      }

      if (!repaired_color && !border && !hover && !visited) continue;

      plans.push({
        element,
        color: repaired_color,
        color_important: !is_link,
        use_layer: is_link && !!repaired_color && !state.authored,
        border,
        hover,
        visited,
      });
    }
  } finally {
    for (let index = 0; index < hovered.length; index += 1) {
      hovered[index].removeAttribute(MEASURING_ATTRIBUTE);
    }
  }

  if (plans.some((plan) => plan.use_layer)) add_link_ink_layer(doc);

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];

    if (plan.color) {
      plan.element.style.setProperty(
        "color",
        plan.color,
        plan.color_important ? "important" : "",
      );
      stats.text_repaired += 1;
    }
    if (plan.border) {
      plan.element.style.setProperty("border-color", plan.border, "important");
      stats.border_repaired += 1;
    }
    if (plan.hover) plan.element.style.setProperty(LINK_HOVER_VAR, plan.hover);
    if (plan.visited) {
      plan.element.style.setProperty(LINK_VISITED_VAR, plan.visited);
      stats.links_tuned += 1;
    }
    if (plan.use_layer && plan.color) {
      plan.element.setAttribute(LINK_INK_ATTRIBUTE, "");
      plan.element.style.setProperty(LINK_INK_VAR, plan.color, "important");
      if (plan.hover) {
        plan.element.style.setProperty(
          LINK_INK_HOVER_VAR,
          plan.hover,
          "important",
        );
      }
      if (plan.visited) {
        plan.element.style.setProperty(
          LINK_INK_VISITED_VAR,
          plan.visited,
          "important",
        );
      }
      plan.element.style.setProperty("transition", "none", "important");
    }
  }

  stats.elapsed_ms =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    started;

  return stats;
}
