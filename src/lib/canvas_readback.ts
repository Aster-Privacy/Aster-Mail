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
const PROBE_SIZE = 8;

let cached_result: boolean | null = null;

function probe_color(index: number): [number, number, number] {
  return [
    (index * 37 + 11) % 256,
    (index * 91 + 53) % 256,
    (index * 151 + 197) % 256,
  ];
}

function run_probe(): boolean {
  if (typeof document === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");

    canvas.width = PROBE_SIZE;
    canvas.height = PROBE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context || typeof context.getImageData !== "function") return false;

    for (let index = 0; index < PROBE_SIZE * PROBE_SIZE; index++) {
      const [r, g, b] = probe_color(index);

      context.fillStyle = `rgb(${r}, ${g}, ${b})`;
      context.fillRect(
        index % PROBE_SIZE,
        Math.floor(index / PROBE_SIZE),
        1,
        1,
      );
    }

    const pixels = context.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data;

    if (!pixels || pixels.length !== PROBE_SIZE * PROBE_SIZE * 4) return false;

    for (let index = 0; index < PROBE_SIZE * PROBE_SIZE; index++) {
      const [r, g, b] = probe_color(index);
      const offset = index * 4;

      if (
        pixels[offset] !== r ||
        pixels[offset + 1] !== g ||
        pixels[offset + 2] !== b ||
        pixels[offset + 3] !== 255
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function canvas_readback_trusted(): boolean {
  if (cached_result === null) cached_result = run_probe();

  return cached_result;
}

export function reset_canvas_readback_check(): void {
  cached_result = null;
}
