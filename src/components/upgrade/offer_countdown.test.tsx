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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}:${Object.values(params).join(",")}` : key,
  }),
}));

import { OfferCountdown } from "./offer_countdown";

const NOW = new Date("2026-11-20T00:00:00Z");

let container: HTMLDivElement;
let root: Root;

async function render_countdown(ends_at: string) {
  await act(async () => {
    root.render(<OfferCountdown ends_at={ends_at} />);
  });
}

describe("OfferCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("shows days and hours until the offer ends", async () => {
    await render_countdown("2026-11-22T05:30:00Z");

    expect(container.textContent).toBe(
      "settings.special_offer_ends_in:2common.time_days_short 5common.time_hours_short",
    );
  });

  it("shows hours and minutes inside the last day", async () => {
    await render_countdown("2026-11-20T03:15:00Z");

    expect(container.textContent).toContain(
      "3common.time_hours_short 15common.time_minutes_short",
    );
  });

  it("renders nothing after the offer ends", async () => {
    await render_countdown("2026-11-19T23:59:59Z");

    expect(container.textContent).toBe("");
  });

  it("renders nothing for an unreadable end time", async () => {
    await render_countdown("not a date");

    expect(container.textContent).toBe("");
  });

  it("counts down as time passes", async () => {
    await render_countdown("2026-11-20T00:10:00Z");
    expect(container.textContent).toContain("10common.time_minutes_short");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(container.textContent).toContain(
      "9common.time_minutes_short 59common.time_seconds_short",
    );
  });
});
