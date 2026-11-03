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
import { useEffect, useState, useSyncExternalStore } from "react";

import app_icon_src from "@/assets/app_icons/calendar.png?inline";

type Rect = readonly [number, number, number, number];

interface DatedIconSpec {
  src: string;
  natural_size: readonly [number, number];
  panel: Rect;
  erase: Rect | null;
  output_height: number;
}

export type DatedCalendarIcon = "app" | "rail";

export interface LabelMetrics {
  left: number;
  right: number;
  ascent: number;
  descent: number;
}

export type LabelMeasurer = (
  label: string,
  font: string,
) => LabelMetrics | null;

export interface PanelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DatedLabelLayout {
  label: string;
  font_px: number;
  x: number;
  y: number;
}

export interface DatedIconBox {
  src: string;
  width: number;
  height: number;
}

export interface DatedIconLayout extends DatedIconBox, DatedLabelLayout {
  erase: Rect | null;
}

export const DATED_ICON_FONT_STACK =
  '"Google Sans Flex", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const DATED_ICON_FONT_WEIGHT = 560;
export const DATED_ICON_PANEL_FILL = "#1d58ee";
export const DATED_ICON_TEXT_FILL = "#ffffff";

const ERASE_MARGIN = 3;
const LABEL_WIDTH_RATIO = 0.78;
const LABEL_HEIGHT_RATIO = 0.62;
const MIN_FONT_PX = 6;

const SPECS: Record<DatedCalendarIcon, DatedIconSpec> = {
  app: {
    src: app_icon_src,
    natural_size: [132, 132],
    panel: [45, 48, 132, 127],
    erase: [58, 63, 115, 111],
    output_height: 132,
  },
  rail: {
    src: "/icons/calendar/calendar_rail_256.png",
    natural_size: [256, 256],
    panel: [95, 100, 231, 223],
    erase: null,
    output_height: 72,
  },
};

const layouts = new Map<string, DatedIconLayout>();

let current_day = new Date().getDate();
let midnight_timer: ReturnType<typeof setTimeout> | null = null;
let day_check_timer: ReturnType<typeof setInterval> | null = null;
let fonts_ready: Promise<unknown> | null = null;
let measure_context: CanvasRenderingContext2D | null | undefined;
const day_listeners = new Set<() => void>();

function is_usable_metrics(metrics: LabelMetrics): boolean {
  const values = [metrics.left, metrics.right, metrics.ascent, metrics.descent];

  return (
    values.every((value) => Number.isFinite(value)) &&
    metrics.left + metrics.right > 0 &&
    metrics.ascent + metrics.descent > 0
  );
}

export function measure_label_with_canvas(
  label: string,
  font: string,
): LabelMetrics | null {
  if (measure_context === undefined) {
    try {
      measure_context =
        typeof document === "undefined"
          ? null
          : document.createElement("canvas").getContext("2d");
    } catch {
      measure_context = null;
    }
  }
  if (!measure_context) return null;

  try {
    measure_context.font = font;
    measure_context.fontKerning = "none";
    measure_context.textAlign = "center";
    measure_context.textBaseline = "alphabetic";
    const measured = measure_context.measureText(label);
    const metrics: LabelMetrics = {
      left: measured.actualBoundingBoxLeft,
      right: measured.actualBoundingBoxRight,
      ascent: measured.actualBoundingBoxAscent,
      descent: measured.actualBoundingBoxDescent,
    };

    return is_usable_metrics(metrics) ? metrics : null;
  } catch {
    return null;
  }
}

export function estimate_label_metrics(
  label: string,
  font_px: number,
): LabelMetrics {
  const glyphs = Math.max(1, label.length);
  const ink_width = font_px * (0.5 * glyphs + 0.08 * (glyphs - 1));

  return {
    left: ink_width / 2,
    right: ink_width / 2,
    ascent: font_px * 0.71,
    descent: 0,
  };
}

export function fit_dated_label(
  label: string,
  panel: PanelBox,
  height_ratio: number,
  font_stack: string,
  measure: LabelMeasurer = measure_label_with_canvas,
): DatedLabelLayout {
  const measure_at = (size_px: number): LabelMetrics => {
    const measured = measure(
      label,
      `${DATED_ICON_FONT_WEIGHT} ${size_px}px ${font_stack}`,
    );

    return measured ?? estimate_label_metrics(label, size_px);
  };
  const fits_panel = (metrics: LabelMetrics): boolean =>
    metrics.left + metrics.right <= panel.width * LABEL_WIDTH_RATIO &&
    metrics.ascent + metrics.descent <= panel.height * height_ratio;

  let font_px = Math.floor(panel.height * 1.4);
  let metrics = measure_at(font_px);

  while (font_px > MIN_FONT_PX && !fits_panel(metrics)) {
    font_px -= 1;
    metrics = measure_at(font_px);
  }

  const center_x =
    panel.left + panel.width / 2 + (metrics.left - metrics.right) / 2;
  const baseline =
    panel.top + panel.height / 2 + (metrics.ascent - metrics.descent) / 2;

  return {
    label,
    font_px,
    x: Math.round(center_x),
    y: Math.round(baseline),
  };
}

function spec_scale(spec: DatedIconSpec): number {
  return Math.min(1, spec.output_height / spec.natural_size[1]);
}

export function dated_icon_box(kind: DatedCalendarIcon): DatedIconBox {
  const spec = SPECS[kind];
  const scale = spec_scale(spec);

  return {
    src: spec.src,
    width: Math.max(1, Math.round(spec.natural_size[0] * scale)),
    height: Math.max(1, Math.round(spec.natural_size[1] * scale)),
  };
}

export function compute_dated_icon_layout(
  kind: DatedCalendarIcon,
  day: number,
  measure: LabelMeasurer = measure_label_with_canvas,
): DatedIconLayout {
  const spec = SPECS[kind];
  const scale = spec_scale(spec);
  const box = dated_icon_box(kind);
  const erase: Rect | null = spec.erase
    ? [
        Math.floor(spec.erase[0] * scale) - ERASE_MARGIN,
        Math.floor(spec.erase[1] * scale) - ERASE_MARGIN,
        Math.ceil((spec.erase[2] - spec.erase[0]) * scale) + ERASE_MARGIN * 2,
        Math.ceil((spec.erase[3] - spec.erase[1]) * scale) + ERASE_MARGIN * 2,
      ]
    : null;
  const [px0, py0, px1, py1] = spec.panel;
  const label = fit_dated_label(
    String(day),
    {
      left: px0 * scale,
      top: py0 * scale,
      width: (px1 - px0) * scale,
      height: (py1 - py0) * scale,
    },
    LABEL_HEIGHT_RATIO,
    DATED_ICON_FONT_STACK,
    measure,
  );

  return { ...box, ...label, erase };
}

function wait_for_fonts(): Promise<unknown> {
  if (fonts_ready) return fonts_ready;
  fonts_ready =
    typeof document !== "undefined" && document.fonts?.load
      ? document.fonts
          .load(`${DATED_ICON_FONT_WEIGHT} 48px "Google Sans Flex"`)
          .catch(() => undefined)
      : Promise.resolve();

  return fonts_ready;
}

function cache_key(kind: DatedCalendarIcon, day: number) {
  return `${kind}:${day}`;
}

function remember_layout(kind: DatedCalendarIcon, day: number) {
  const key = cache_key(kind, day);
  const existing = layouts.get(key);

  if (existing) return existing;

  const layout = compute_dated_icon_layout(kind, day);

  for (const stale of layouts.keys()) {
    if (stale.startsWith(`${kind}:`)) layouts.delete(stale);
  }
  layouts.set(key, layout);

  return layout;
}

function ms_until_midnight(now = new Date()) {
  const next = new Date(now);

  next.setHours(24, 0, 0, 0);

  return Math.max(1000, next.getTime() - now.getTime());
}

function sync_day() {
  const day = new Date().getDate();

  if (day === current_day) return;
  current_day = day;
  day_listeners.forEach((listener) => listener());
}

function schedule_midnight() {
  if (midnight_timer) clearTimeout(midnight_timer);
  midnight_timer = setTimeout(() => {
    sync_day();
    schedule_midnight();
  }, ms_until_midnight());
}

function handle_visibility() {
  if (document.visibilityState === "visible") {
    sync_day();
    schedule_midnight();
  }
}

function subscribe_day(listener: () => void) {
  if (day_listeners.size === 0) {
    sync_day();
    schedule_midnight();
    document.addEventListener("visibilitychange", handle_visibility);
    window.addEventListener("focus", sync_day);
    window.addEventListener("pageshow", sync_day);
    day_check_timer = setInterval(sync_day, 60_000);
  }
  day_listeners.add(listener);

  return () => {
    day_listeners.delete(listener);
    if (day_listeners.size === 0) {
      if (midnight_timer) clearTimeout(midnight_timer);
      midnight_timer = null;
      if (day_check_timer) clearInterval(day_check_timer);
      day_check_timer = null;
      document.removeEventListener("visibilitychange", handle_visibility);
      window.removeEventListener("focus", sync_day);
      window.removeEventListener("pageshow", sync_day);
    }
  };
}

function get_day() {
  return current_day;
}

export function use_dated_calendar_layout(
  kind: DatedCalendarIcon,
): DatedIconLayout | null {
  const day = useSyncExternalStore(subscribe_day, get_day, get_day);
  const [layout, set_layout] = useState<DatedIconLayout | null>(
    () => layouts.get(cache_key(kind, day)) ?? null,
  );

  useEffect(() => {
    const ready = layouts.get(cache_key(kind, day));

    if (ready) {
      set_layout(ready);

      return;
    }

    let active = true;

    void wait_for_fonts().then(() => {
      if (active) set_layout(remember_layout(kind, day));
    });

    return () => {
      active = false;
    };
  }, [kind, day]);

  return layout;
}
