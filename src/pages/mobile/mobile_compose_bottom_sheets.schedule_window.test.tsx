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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/mobile/mobile_bottom_sheet", () => ({
  MobileBottomSheet: ({
    is_open,
    children,
  }: {
    is_open: boolean;
    children: React.ReactNode;
  }) => (is_open ? <div>{children}</div> : null),
}));

import { MobileScheduleSheet } from "@/pages/mobile/mobile_compose_bottom_sheets";
import { set_display_time_zone } from "@/utils/date_format";

const NOW = new Date("2026-10-03T13:00:00Z");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  set_display_time_zone("Europe/Lisbon");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  set_display_time_zone(undefined);
  vi.useRealTimers();
});

function button_with_text(text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  );

  if (!match) throw new Error(`button "${text}" not found`);

  return match as HTMLButtonElement;
}

function type_into(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function pick(date: string, time: string, on_schedule = vi.fn()) {
  await act(async () => {
    root.render(
      <MobileScheduleSheet
        is_open
        has_scheduled_time={false}
        on_clear={() => {}}
        on_close={() => {}}
        on_schedule={on_schedule}
        t={(key) => key}
      />,
    );
  });

  await act(async () => {
    button_with_text("mail.pick_date_time").click();
  });

  const date_input = container.querySelector(
    'input[type="date"]',
  ) as HTMLInputElement;
  const time_input = container.querySelector(
    'input[type="time"]',
  ) as HTMLInputElement;

  await act(async () => {
    type_into(date_input, date);
    type_into(time_input, time);
  });

  return { on_schedule, date_input };
}

describe("MobileScheduleSheet custom time on the last day of the window", () => {
  it("stops the date field at the last day of the window", async () => {
    const { date_input } = await pick("2026-10-31", "09:00");

    expect(date_input.max).toBe("2026-10-31");
  });

  it("bounds the date field in the account zone, not the device zone", async () => {
    const device_zone = process.env.TZ;

    process.env.TZ = "Pacific/Kiritimati";

    try {
      const { date_input } = await pick("2026-10-31", "09:00");

      expect(date_input.min).toBe("2026-10-03");
      expect(date_input.max).toBe("2026-10-31");
    } finally {
      process.env.TZ = device_zone;
    }
  });

  it("disables Confirm and explains why past the 28-day cutoff", async () => {
    const { on_schedule } = await pick("2026-10-31", "15:00");

    const confirm = button_with_text("common.confirm");

    expect(confirm.disabled).toBe(true);
    expect(container.textContent).toContain("common.scheduled_too_far_ahead");

    await act(async () => {
      confirm.click();
    });

    expect(on_schedule).not.toHaveBeenCalled();
  });

  it("accepts the cutoff itself across the DST change", async () => {
    const { on_schedule } = await pick("2026-10-31", "13:00");

    const confirm = button_with_text("common.confirm");

    expect(confirm.disabled).toBe(false);
    expect(container.textContent).not.toContain(
      "common.scheduled_too_far_ahead",
    );

    await act(async () => {
      confirm.click();
    });

    expect(on_schedule).toHaveBeenCalledWith(new Date("2026-10-31T13:00:00Z"));
  });
});
