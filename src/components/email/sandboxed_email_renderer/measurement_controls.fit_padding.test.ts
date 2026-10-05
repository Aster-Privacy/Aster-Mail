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
const ENGINES = ["chromium", "gecko"] as const;

const MEASUREMENT_WRITES = new Set([
  "zoom",
  "overflow-x",
  "height",
  "min-height",
]);

type Engine = (typeof ENGINES)[number];

interface FitOptions {
  frame_width?: number;
  base_zoom?: number;
  body_style?: string;
  body_extra?: number;
}

const end_padding_of = (body: HTMLElement): number => {
  const inline = body.style.getPropertyValue("padding-inline-end");

  return inline ? parseFloat(inline) : DEFAULT_END_PADDING;
};

const mount_email = (
  content: number | ((content_box: number) => number),
  engine: Engine,
  frame_width: number,
  body_style: string,
  body_extra: number,
) => {
  const doc = document.implementation.createHTMLDocument("");
  const body = doc.body;
  const content_width = () => {
    const content_box = frame_width - START_PADDING - end_padding_of(body);

    return typeof content === "function" ? content(content_box) : content;
  };

  body.setAttribute("style", body_style);
  Object.defineProperty(body, "scrollWidth", {
    configurable: true,
    get: () => {
      const end_padding = end_padding_of(body);
      const width = content_width();

      if (width <= frame_width - START_PADDING - end_padding) {
        return frame_width;
      }

      return (
        START_PADDING +
        width +
        body_extra +
        (engine === "gecko" ? end_padding : 0)
      );
    },
  });
  Object.defineProperty(doc.documentElement, "scrollWidth", {
    configurable: true,
    get: () => Math.max(frame_width, START_PADDING + content_width()),
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

  return { body, iframe: iframe as unknown as HTMLIFrameElement };
};

const fit = (
  content: number | ((content_box: number) => number),
  engine: Engine,
  options: FitOptions = {},
) => {
  const { body, iframe } = mount_email(
    content,
    engine,
    options.frame_width ?? FRAME_WIDTH,
    options.body_style ?? "padding:8px 16px 8px 16px",
    options.body_extra ?? 0,
  );
  const set_property = vi.spyOn(body.style, "setProperty");
  const remove_property = vi.spyOn(body.style, "removeProperty");
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
    on_document_ready_ref: { current: undefined },
    set_height_ready: vi.fn(),
    set_iframe_height: vi.fn(),
  });

  controls.measure_and_apply(true);

  const written = [
    ...set_property.mock.calls.map(([name]) => name),
    ...remove_property.mock.calls.map(([name]) => name),
  ];

  return { body, written };
};

describe("fitting a wide email to the reading pane", () => {
  it.each(ENGINES)("keeps the frame margin on both sides in %s", (engine) => {
    const { body } = fit(600, engine);

    expect(body.style.getPropertyValue("zoom")).toBe("0.861");
    expect(body.style.getPropertyValue("overflow-x")).toBe("");
  });

  it.each(ENGINES)(
    "leaves the email's own styles alone while measuring in %s",
    (engine) => {
      const { body, written } = fit(600, engine);

      expect(written.filter((name) => !MEASUREMENT_WRITES.has(name))).toEqual(
        [],
      );
      expect(body.style.getPropertyValue("padding-right")).toBe("16px");
    },
  );

  it("fits the layout a container query gives the email, not a wider one", () => {
    const { body } = fit(
      (content_box) => (content_box <= 515 ? 600 : 500),
      "chromium",
    );

    expect(body.style.getPropertyValue("zoom")).toBe("0.861");
  });

  it.each(ENGINES)(
    "leaves room for the body's own end padding in %s",
    (engine) => {
      const { body } = fit(600, engine, {
        body_style: "padding:8px 16px 8px 16px;padding-inline-end:24px",
      });

      expect(body.style.getPropertyValue("zoom")).toBe("0.85");
    },
  );

  it("never fits an email to less than the width its body measures", () => {
    const { body } = fit(600, "chromium", { body_extra: 84 });

    expect(body.style.getPropertyValue("zoom")).toBe("0.777");
  });

  it("leaves an email that only reaches into the end padding unscaled", () => {
    const { body } = fit(520, "chromium");

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
