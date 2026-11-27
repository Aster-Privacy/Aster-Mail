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
import { describe, expect, it } from "vitest";

import {
  IMAGE_WIDTH_LARGE_STEP,
  IMAGE_WIDTH_STEP,
  MIN_IMAGE_WIDTH,
  apply_image_width,
  clamp_image_width,
  compute_drag_width,
  read_image_width,
  step_image_width,
} from "@/lib/compose_image_size";

describe("clamp_image_width", () => {
  it("keeps a width inside the limits", () => {
    expect(clamp_image_width(240.4, 600)).toBe(240);
  });

  it("enforces the minimum", () => {
    expect(clamp_image_width(5, 600)).toBe(MIN_IMAGE_WIDTH);
    expect(clamp_image_width(-40, 600)).toBe(MIN_IMAGE_WIDTH);
  });

  it("enforces the editor width", () => {
    expect(clamp_image_width(2000, 612.8)).toBe(612);
  });

  it("has no ceiling when the editor width is unknown", () => {
    expect(clamp_image_width(2000, Infinity)).toBe(2000);
    expect(clamp_image_width(2000, 0)).toBe(2000);
  });

  it("falls back to the minimum for invalid input", () => {
    expect(clamp_image_width(Number.NaN, 600)).toBe(MIN_IMAGE_WIDTH);
  });

  it("never sets a ceiling below the minimum", () => {
    expect(clamp_image_width(100, 10)).toBe(MIN_IMAGE_WIDTH);
  });
});

describe("compute_drag_width", () => {
  const base = { start_width: 400, start_height: 200, max_width: 800 };

  it("grows when the east handles move right", () => {
    expect(compute_drag_width({ ...base, handle: "se", dx: 50, dy: 0 })).toBe(
      450,
    );
    expect(compute_drag_width({ ...base, handle: "ne", dx: 50, dy: 0 })).toBe(
      450,
    );
  });

  it("grows when the west handles move left", () => {
    expect(compute_drag_width({ ...base, handle: "sw", dx: -50, dy: 0 })).toBe(
      450,
    );
    expect(compute_drag_width({ ...base, handle: "nw", dx: -50, dy: 0 })).toBe(
      450,
    );
  });

  it("shrinks when a handle moves inward", () => {
    expect(
      compute_drag_width({ ...base, handle: "se", dx: -100, dy: 0 }),
    ).toBe(300);
    expect(compute_drag_width({ ...base, handle: "nw", dx: 100, dy: 0 })).toBe(
      300,
    );
  });

  it("converts vertical movement through the aspect ratio", () => {
    expect(compute_drag_width({ ...base, handle: "se", dx: 0, dy: 50 })).toBe(
      500,
    );
    expect(compute_drag_width({ ...base, handle: "ne", dx: 0, dy: -50 })).toBe(
      500,
    );
    expect(compute_drag_width({ ...base, handle: "sw", dx: 0, dy: -25 })).toBe(
      350,
    );
  });

  it("follows the larger of the two movements", () => {
    expect(compute_drag_width({ ...base, handle: "se", dx: 10, dy: 40 })).toBe(
      480,
    );
    expect(compute_drag_width({ ...base, handle: "se", dx: 120, dy: 10 })).toBe(
      520,
    );
  });

  it("clamps to the minimum and the editor width", () => {
    expect(
      compute_drag_width({ ...base, handle: "se", dx: -900, dy: 0 }),
    ).toBe(MIN_IMAGE_WIDTH);
    expect(compute_drag_width({ ...base, handle: "se", dx: 900, dy: 0 })).toBe(
      800,
    );
  });

  it("treats a zero height as a square", () => {
    expect(
      compute_drag_width({
        handle: "se",
        start_width: 100,
        start_height: 0,
        dx: 0,
        dy: 30,
        max_width: 800,
      }),
    ).toBe(130);
  });
});

describe("step_image_width", () => {
  it("steps with the arrow keys", () => {
    expect(step_image_width(200, "ArrowRight", false, 600)).toBe(
      200 + IMAGE_WIDTH_STEP,
    );
    expect(step_image_width(200, "ArrowUp", false, 600)).toBe(
      200 + IMAGE_WIDTH_STEP,
    );
    expect(step_image_width(200, "ArrowLeft", false, 600)).toBe(
      200 - IMAGE_WIDTH_STEP,
    );
    expect(step_image_width(200, "ArrowDown", true, 600)).toBe(
      200 - IMAGE_WIDTH_LARGE_STEP,
    );
  });

  it("jumps to the limits with Home and End", () => {
    expect(step_image_width(200, "Home", false, 600)).toBe(MIN_IMAGE_WIDTH);
    expect(step_image_width(200, "End", false, 600)).toBe(600);
    expect(step_image_width(200, "End", false, Infinity)).toBeNull();
  });

  it("stays inside the limits", () => {
    expect(step_image_width(595, "ArrowRight", true, 600)).toBe(600);
    expect(step_image_width(35, "ArrowLeft", false, 600)).toBe(
      MIN_IMAGE_WIDTH,
    );
  });

  it("ignores other keys", () => {
    expect(step_image_width(200, "a", false, 600)).toBeNull();
    expect(step_image_width(200, "Enter", false, 600)).toBeNull();
  });
});

describe("apply_image_width", () => {
  it("writes the width attribute and inline style", () => {
    const img = document.createElement("img");

    img.setAttribute("height", "300");
    img.setAttribute("style", "max-width: 100%; display: block;");
    apply_image_width(img, 240.6);

    expect(img.getAttribute("width")).toBe("241");
    expect(img.hasAttribute("height")).toBe(false);
    expect(img.style.width).toBe("241px");
    expect(img.style.height).toBe("auto");
    expect(img.style.maxWidth).toBe("100%");
    expect(img.style.display).toBe("block");
  });

  it("reads the width back without layout", () => {
    const img = document.createElement("img");

    apply_image_width(img, 180);
    expect(read_image_width(img)).toBe(180);

    const plain = document.createElement("img");

    plain.setAttribute("width", "90");
    expect(read_image_width(plain)).toBe(90);
    expect(read_image_width(document.createElement("img"))).toBe(0);
  });
});
