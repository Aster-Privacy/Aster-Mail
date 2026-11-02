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
  placeholder: string;
  fallback: string;
  panel: Rect;
  erase: Rect | null;
  output_height: number;
}

export type DatedCalendarIcon = "app";

const FONT_STACK =
  '"Google Sans Flex", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PANEL_FILL = "#1d58ee";
const ERASE_MARGIN = 3;

const SPECS: Record<DatedCalendarIcon, DatedIconSpec> = {
  app: {
    src: app_icon_src,
    placeholder: app_icon_src,
    fallback: app_icon_src,
    panel: [45, 48, 132, 127],
    erase: [58, 63, 115, 111],
    output_height: 132,
  },
};

const image_promises = new Map<string, Promise<HTMLImageElement>>();
const rendered = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

let current_day = new Date().getDate();
let midnight_timer: ReturnType<typeof setTimeout> | null = null;
let day_check_timer: ReturnType<typeof setInterval> | null = null;
let fonts_ready: Promise<unknown> | null = null;
const day_listeners = new Set<() => void>();

function load_image(src: string): Promise<HTMLImageElement> {
  const cached = image_promises.get(src);

  if (cached) return cached;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("calendar icon failed to load"));
    image.src = src;
  });

  promise.catch(() => image_promises.delete(src));
  image_promises.set(src, promise);

  return promise;
}

function wait_for_fonts(): Promise<unknown> {
  if (fonts_ready) return fonts_ready;
  fonts_ready =
    typeof document !== "undefined" && document.fonts?.load
      ? document.fonts
          .load(`560 48px "Google Sans Flex"`)
          .catch(() => undefined)
      : Promise.resolve();

  return fonts_ready;
}

function draw(spec: DatedIconSpec, image: HTMLImageElement, day: number) {
  const natural_w = image.naturalWidth;
  const natural_h = image.naturalHeight;

  if (!natural_w || !natural_h) return null;

  const scale = Math.min(1, spec.output_height / natural_h);
  const width = Math.max(1, Math.round(natural_w * scale));
  const height = Math.max(1, Math.round(natural_h * scale));

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) return null;

  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  if (spec.erase) {
    const [x0, y0, x1, y1] = spec.erase;

    context.fillStyle = PANEL_FILL;
    context.fillRect(
      Math.floor(x0 * scale) - ERASE_MARGIN,
      Math.floor(y0 * scale) - ERASE_MARGIN,
      Math.ceil((x1 - x0) * scale) + ERASE_MARGIN * 2,
      Math.ceil((y1 - y0) * scale) + ERASE_MARGIN * 2,
    );
  }

  const [px0, py0, px1, py1] = spec.panel;
  const panel_left = px0 * scale;
  const panel_top = py0 * scale;
  const panel_width = (px1 - px0) * scale;
  const panel_height = (py1 - py0) * scale;
  const label = String(day);

  context.fontKerning = "none";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";

  let font_px = Math.floor(panel_height * 1.4);

  context.font = `560 ${font_px}px ${FONT_STACK}`;
  let metrics = context.measureText(label);

  for (;;) {
    context.font = `560 ${font_px}px ${FONT_STACK}`;
    metrics = context.measureText(label);
    const ink_width =
      metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
    const ink_height =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

    if (
      font_px <= 6 ||
      (ink_width <= panel_width * 0.78 && ink_height <= panel_height * 0.62)
    ) {
      break;
    }

    font_px -= 1;
  }

  const center_x =
    panel_left +
    panel_width / 2 +
    (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
  const baseline =
    panel_top +
    panel_height / 2 +
    (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;

  context.fillText(label, Math.round(center_x), Math.round(baseline));

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function cache_key(kind: DatedCalendarIcon, day: number) {
  return `${kind}:${day}`;
}

function render(kind: DatedCalendarIcon, day: number): Promise<string | null> {
  const key = cache_key(kind, day);
  const done = rendered.get(key);

  if (done) return Promise.resolve(done);

  const in_flight = pending.get(key);

  if (in_flight) return in_flight;

  const spec = SPECS[kind];
  const promise = Promise.all([load_image(spec.src), wait_for_fonts()])
    .then(([image]) => {
      const url = draw(spec, image, day);

      if (url) {
        for (const existing of rendered.keys()) {
          if (existing.startsWith(`${kind}:`)) rendered.delete(existing);
        }
        rendered.set(key, url);
      }

      return url;
    })
    .catch(() => null)
    .finally(() => pending.delete(key));

  pending.set(key, promise);

  return promise;
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

export function use_dated_calendar_icon(kind: DatedCalendarIcon): string {
  const day = useSyncExternalStore(subscribe_day, get_day, get_day);
  const [src, set_src] = useState(
    () => rendered.get(cache_key(kind, day)) ?? SPECS[kind].placeholder,
  );

  useEffect(() => {
    let active = true;
    const ready = rendered.get(cache_key(kind, day));

    if (ready) {
      set_src(ready);

      return;
    }

    void render(kind, day).then((url) => {
      if (active) set_src(url ?? SPECS[kind].fallback);
    });

    return () => {
      active = false;
    };
  }, [kind, day]);

  return src;
}
