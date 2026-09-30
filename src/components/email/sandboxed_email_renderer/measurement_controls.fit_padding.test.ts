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
import { describe, it, expect, vi } from "vitest";

import { build_measurement_controls } from "./measurement_controls";

const FRAME_WIDTH = 544;
const START_PADDING = 16;
const DEFAULT_END_PADDING = 16;

type Engine = "chromium" | "gecko";

interface FitOptions {
  frame_width?: number;
  base_zoom?: number;
  body_style?: string;
}

const end_padding_of = (body: HTMLElement): number => {
  const inline = body.style.getPropertyValue("padding-inline-end");

  return inline ? parseFloat(inline) : DEFAULT_END_PADDING;
};

// Lays out a body holding one block of content_width px. Chromium leaves
// the end padding out of an overflowing body's scrollWidth, Gecko counts it.
const mount_email = (
  content_width: number,
  engine: Engine,
  frame_width: number,
  body_style: string,
) => {
  const doc = document.implementation.createHTMLDocument("");
  const body = doc.body;
  const end_paddings_seen: number[] = [];

  body.setAttribute("style", body_style);
  Object.defineProperty(body, "scrollWidth", {
    configurable: true,
    get: () => {
      const end_padding = end_padding_of(body);

      end_paddings_seen.push(end_padding);
      if (content_width <= frame_width - START_PADDING - end_padding) {
        return frame_width;
      }

      return (
        START_PADDING + content_width + (engine === "gecko" ? end_padding : 0)
      );
    },
  });
  Object.defineProperty(doc.documentElement, "scrollWidth", {
    configurable: true,
    get: () => Math.max(frame_width, START_PADDING + content_width),
  });
  doc.getSelection = () => null;

  const iframe = {
    clientWidth: frame_width,
    contentDocument: doc,
    contentWindow: {
      getComputedStyle: (el: HTMLElement) => ({
        zoom: el.style.getPropertyValue("zoom") || "1",
        paddingInlineEnd: `${end_padding_of(el)}px`,
      }),
    },
    parentElement: null,
    style: { height: "" },
  };

  return {
    body,
    end_paddings_seen,
    iframe: iframe as unknown as HTMLIFrameElement,
  };
};

const fit = (
  content_width: number,
  engine: Engine,
  options: FitOptions = {},
) => {
  const { body, end_paddings_seen, iframe } = mount_email(
    content_width,
    engine,
    options.frame_width ?? FRAME_WIDTH,
    options.body_style ?? "padding:8px 16px 8px 16px",
  );
  const controls = build_measurement_controls({
    iframe,
    email_id: undefined,
    base_zoom_ref: { current: options.base_zoom ?? 1 },
    document_ready_cleanup_ref: { current: null },
    has_fired_ready_ref: { current: false },
    mutation_observer_ref: { current: null },
    observer_ref: { current: null },
    raf_ref: { current: 0 },
    remeasure_ref: { current: null },
    stable_timer_ref: { current: null },
    on_document_ready_ref: { current: undefined },
    set_height_ready: vi.fn(),
    set_iframe_height: vi.fn(),
  });

  controls.measure_and_apply(true);

  return { body, end_paddings_seen };
};

describe("fitting a wide email to the reading pane", () => {
  it.each(["chromium", "gecko"] as const)(
    "keeps the frame margin on both sides in %s",
    (engine) => {
      const { body } = fit(600, engine);

      expect(body.style.getPropertyValue("zoom")).toBe("0.861");
      expect(body.style.getPropertyValue("overflow-x")).toBe("");
    },
  );

  it("puts the frame padding back after measuring", () => {
    const { body, end_paddings_seen } = fit(600, "chromium");

    expect(end_paddings_seen).toEqual([16, 0]);
    expect(body.style.getPropertyValue("padding-inline-end")).toBe("");
    expect(body.style.getPropertyValue("padding-right")).toBe("16px");
  });

  it("restores an end padding the body already had", () => {
    const { body } = fit(600, "chromium", {
      body_style: "padding:8px 16px 8px 16px;padding-inline-end:24px",
    });

    expect(body.style.getPropertyValue("padding-inline-end")).toBe("24px");
    expect(body.style.getPropertyPriority("padding-inline-end")).toBe("");
    expect(body.style.getPropertyValue("zoom")).toBe("0.85");
  });

  it.each(["chromium", "gecko"] as const)(
    "leaves an email that only reaches into the end padding unscaled in %s",
    (engine) => {
      const { body } = fit(520, engine);

      expect(body.style.getPropertyValue("zoom")).toBe("1");
    },
  );

  it("measures an email that fits once, with its padding in place", () => {
    const { body, end_paddings_seen } = fit(400, "gecko");

    expect(end_paddings_seen).toEqual([16]);
    expect(body.style.getPropertyValue("zoom")).toBe("1");
  });

  it("leaves an email that already fits at the reader's zoom", () => {
    const { body } = fit(400, "chromium", { base_zoom: 1.25 });

    expect(body.style.getPropertyValue("zoom")).toBe("1.25");
  });

  it("never scales a narrow email up on a wide pane", () => {
    const { body } = fit(600, "chromium", { frame_width: 1824 });

    expect(body.style.getPropertyValue("zoom")).toBe("1");
  });
});
