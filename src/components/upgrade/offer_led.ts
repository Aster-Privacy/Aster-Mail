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
export const LED_VIEW_WIDTH = 880;
export const LED_VIEW_HEIGHT = 440;

const LED_CENTER_X = 515.9;
const LED_CENTER_Y = 211.2;
const LED_HEIGHT = 73.3;
const LED_PITCH = 2.93;
const MASK_SCALE = 4;

const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

type Point = [number, number];

export interface LedDot {
  x: number;
  y: number;
}

export interface LedLayout {
  dots: LedDot[];
  dot_radius: number;
  hot_radius: number;
  center_x: number;
  center_y: number;
  width: number;
  height: number;
}

export function led_text(percent: number): string {
  return `-${Math.round(percent)}%`;
}

function hseg(x0: number, x1: number, y: number, t: number): Point[] {
  return [
    [x0, y],
    [x0 + t / 2, y - t / 2],
    [x1 - t / 2, y - t / 2],
    [x1, y],
    [x1 - t / 2, y + t / 2],
    [x0 + t / 2, y + t / 2],
  ];
}

function vseg(x: number, y0: number, y1: number, t: number): Point[] {
  return [
    [x, y0],
    [x + t / 2, y0 + t / 2],
    [x + t / 2, y1 - t / 2],
    [x, y1],
    [x - t / 2, y1 - t / 2],
    [x - t / 2, y0 + t / 2],
  ];
}

function char_width(char: string, w: number): number {
  if (char === "-") return w * 0.62;
  if (char === "%") return w * 0.95;

  return w;
}

function fill_polygon(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  points.forEach(([x, y], index) =>
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
  );
  ctx.closePath();
  ctx.fill();
}

function draw_char(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  g: number,
) {
  if (char === "-") {
    fill_polygon(ctx, hseg(x, x + w, y + h / 2, t));

    return;
  }

  if (char === "%") {
    const r = w * 0.2;

    ctx.lineWidth = t * 0.8;
    ctx.beginPath();
    ctx.ellipse(x + r + t * 0.3, y + h * 0.2, r, h * 0.17, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(
      x + w - r - t * 0.3,
      y + h * 0.8,
      r,
      h * 0.17,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.lineWidth = t * 0.85;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.12, y + h * 0.98);
    ctx.lineTo(x + w * 0.88, y + h * 0.02);
    ctx.stroke();

    return;
  }

  const segments = SEGMENTS[char];

  if (!segments) return;

  const left = x + t / 2;
  const right = x + w - t / 2;
  const top = y + t / 2;
  const middle = y + h / 2;
  const bottom = y + h - t / 2;
  const shapes: Record<string, Point[]> = {
    a: hseg(left + g, right - g, top, t),
    g: hseg(left + g, right - g, middle, t),
    d: hseg(left + g, right - g, bottom, t),
    f: vseg(left, top + g, middle - g, t),
    e: vseg(left, middle + g, bottom - g, t),
    b: vseg(right, top + g, middle - g, t),
    c: vseg(right, middle + g, bottom - g, t),
  };

  for (const segment of segments) fill_polygon(ctx, shapes[segment]);
}

export function layout_led(
  text: string,
  create_canvas: () => HTMLCanvasElement | null = () =>
    typeof document === "undefined" ? null : document.createElement("canvas"),
): LedLayout | null {
  const h = LED_HEIGHT;
  const w = h * 0.58;
  const t = h * 0.135;
  const g = h * 0.012;
  const gap = w * 0.24;
  const chars = [...text];
  const widths = chars.map((char) => char_width(char, w));
  const total = widths.reduce((sum, width) => sum + width, 0) +
    gap * (chars.length - 1);
  const x0 = LED_CENTER_X - total / 2 - 10;
  const y0 = LED_CENTER_Y - h / 2 - 10;
  const box_width = total + 20;
  const box_height = h + 20;
  const canvas = create_canvas();
  const ctx = canvas?.getContext("2d");

  if (!canvas || !ctx) return null;

  canvas.width = Math.ceil(box_width * MASK_SCALE);
  canvas.height = Math.ceil(box_height * MASK_SCALE);
  ctx.scale(MASK_SCALE, MASK_SCALE);
  ctx.translate(-x0, -y0);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";

  let cursor = LED_CENTER_X - total / 2;

  chars.forEach((char, index) => {
    draw_char(ctx, char, cursor, LED_CENTER_Y - h / 2, widths[index], h, t, g);
    cursor += widths[index] + gap;
  });

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const dots: LedDot[] = [];
  const first_x = LED_PITCH / 2 + Math.ceil((x0 - LED_PITCH / 2) / LED_PITCH) * LED_PITCH;
  const first_y = LED_PITCH / 2 + Math.ceil((y0 - LED_PITCH / 2) / LED_PITCH) * LED_PITCH;

  for (let y = first_y; y < y0 + box_height; y += LED_PITCH) {
    for (let x = first_x; x < x0 + box_width; x += LED_PITCH) {
      const px = Math.floor((x - x0) * MASK_SCALE);
      const py = Math.floor((y - y0) * MASK_SCALE);

      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
        continue;
      }

      if (pixels[(py * canvas.width + px) * 4 + 3] > 127) {
        dots.push({ x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
      }
    }
  }

  return {
    dots,
    dot_radius: LED_PITCH * 0.43,
    hot_radius: LED_PITCH * 0.25,
    center_x: LED_CENTER_X,
    center_y: LED_CENTER_Y,
    width: total,
    height: h,
  };
}
