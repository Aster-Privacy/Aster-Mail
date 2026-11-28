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
import type { ReactNode } from "react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const UNITS: Record<string, string> = {
  "common.time_days_short": "d",
  "common.time_hours_short": "h",
  "common.time_minutes_short": "m",
  "common.time_seconds_short": "s",
};

const h = vi.hoisted(() => ({
  i18n: {
    t: (key: string, params?: Record<string, string>) => {
      const short_units: Record<string, string> = {
        "common.time_days_short": "d",
        "common.time_hours_short": "h",
        "common.time_minutes_short": "m",
        "common.time_seconds_short": "s",
      };

      if (short_units[key]) return short_units[key];
      if (params?.time !== undefined) return `${key}:${params.time}`;

      return key;
    },
  },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => h.i18n,
}));

vi.mock("@aster/ui", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

const { ExpirationCountdown, expiry_urgency, format_expiry_remaining } =
  await import("./expiration_countdown");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const units = ((key: string) => UNITS[key] ?? key) as Parameters<
  typeof format_expiry_remaining
>[1];

describe("format_expiry_remaining", () => {
  it("keeps the label to two units at most", () => {
    expect(
      format_expiry_remaining(2 * DAY + 3 * HOUR + 5 * MINUTE, units),
    ).toBe("2d 3h");
    expect(format_expiry_remaining(2 * DAY, units)).toBe("2d");
    expect(format_expiry_remaining(5 * HOUR + 12 * MINUTE, units)).toBe(
      "5h 12m",
    );
    expect(format_expiry_remaining(5 * HOUR, units)).toBe("5h");
    expect(format_expiry_remaining(59 * MINUTE + 30_000, units)).toBe("59m");
    expect(format_expiry_remaining(12_000, units)).toBe("12s");
    expect(format_expiry_remaining(200, units)).toBe("1s");
    expect(format_expiry_remaining(0, units)).toBe("");
  });
});

describe("expiry_urgency", () => {
  it("maps the remaining time to a tone", () => {
    expect(expiry_urgency(2 * DAY)).toBe("later");
    expect(expiry_urgency(5 * HOUR)).toBe("today");
    expect(expiry_urgency(30 * MINUTE)).toBe("soon");
    expect(expiry_urgency(0)).toBe("expired");
    expect(expiry_urgency(Number.NaN)).toBe("expired");
  });
});

describe("ExpirationCountdown", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  function pills(): HTMLElement[] {
    return [
      ...container.querySelectorAll('[data-testid="expiry-pill"]'),
    ] as HTMLElement[];
  }

  it("renders one compact pill and fires on_expired once", async () => {
    const on_expired = vi.fn();

    await act(async () => {
      root.render(
        <ExpirationCountdown
          expires_at={new Date(Date.now() + 2 * MINUTE)}
          on_expired={on_expired}
        />,
      );
    });

    expect(pills()).toHaveLength(1);
    expect(pills()[0].dataset.urgency).toBe("soon");
    expect(pills()[0].className).toContain("whitespace-nowrap");
    expect(pills()[0].textContent).toBe("mail.expires_in_time:2m");

    await act(async () => {
      vi.advanceTimersByTime(3 * MINUTE);
    });

    expect(pills()[0].dataset.urgency).toBe("expired");
    expect(pills()[0].textContent).toBe("common.expired");

    await act(async () => {
      vi.advanceTimersByTime(10 * MINUTE);
    });

    expect(on_expired).toHaveBeenCalledTimes(1);
  });

  it("uses the amber tone within a day and slate beyond it", async () => {
    await act(async () => {
      root.render(
        <>
          <ExpirationCountdown expires_at={new Date(Date.now() + 5 * HOUR)} />
          <ExpirationCountdown expires_at={new Date(Date.now() + 3 * DAY)} />
        </>,
      );
    });

    expect(pills().map((pill) => pill.dataset.urgency)).toEqual([
      "today",
      "later",
    ]);
    expect(pills()[0].getAttribute("style")).toContain("--cat-amber-fg");
    expect(pills()[1].getAttribute("style")).toContain("--cat-slate-fg");
  });
});
