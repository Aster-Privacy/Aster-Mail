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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DatedCalendarImage } from "./dated_calendar_image";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("dated calendar image", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 3, 9, 0, 0));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("draws the day as text over the static artwork without reading pixels", async () => {
    const to_data_url = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL");
    const get_image_data = vi.fn();

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "",
      fontKerning: "auto",
      getImageData: get_image_data,
      measureText: (label: string) => ({
        actualBoundingBoxLeft: 0.25 * label.length,
        actualBoundingBoxRight: 0.25 * label.length,
        actualBoundingBoxAscent: 0.7,
        actualBoundingBoxDescent: 0,
      }),
    } as unknown as CanvasRenderingContext2D);

    act(() =>
      root.render(<DatedCalendarImage className="h-6 w-6" kind="app" />),
    );
    await flush();

    const svg = container.querySelector("svg");
    const text = svg?.querySelector("text");

    expect(svg?.getAttribute("viewBox")).toBe("0 0 132 132");
    expect(svg?.getAttribute("class")).toBe("h-6 w-6");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelector("image")?.getAttribute("href")).toBeTruthy();
    expect(svg?.querySelector("rect")?.getAttribute("fill")).toBe("#1d58ee");
    expect(text?.textContent).toBe("3");
    expect(text?.getAttribute("text-anchor")).toBe("middle");
    expect(text?.getAttribute("fill")).toBe("#ffffff");
    expect(text?.getAttribute("font-weight")).toBe("560");
    expect(Number(text?.getAttribute("font-size"))).toBeGreaterThan(6);
    expect(to_data_url).not.toHaveBeenCalled();
    expect(get_image_data).not.toHaveBeenCalled();
  });

  it("labels the artwork when it carries meaning", async () => {
    act(() => root.render(<DatedCalendarImage alt="Calendar" kind="rail" />));
    await flush();

    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Calendar");
    expect(svg?.hasAttribute("aria-hidden")).toBe(false);
    expect(svg?.querySelector("rect")).toBeNull();
    expect(svg?.querySelector("text")?.textContent).toBe("3");
  });

  it("aligns to the start edge when asked", () => {
    act(() => root.render(<DatedCalendarImage align="start" kind="rail" />));

    expect(
      container.querySelector("svg")?.getAttribute("preserveAspectRatio"),
    ).toBe("xMinYMid meet");
  });

  it("shows the fallback when the artwork fails to load", () => {
    act(() =>
      root.render(
        <DatedCalendarImage
          fallback={<span data-testid="fallback" />}
          kind="app"
        />,
      ),
    );

    act(() => {
      container.querySelector("image")?.dispatchEvent(new Event("error"));
    });

    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-testid='fallback']")).not.toBeNull();
  });
});
