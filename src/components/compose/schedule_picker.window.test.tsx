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

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

import { SchedulePicker } from "@/components/compose/schedule_picker";
import { set_display_time_zone } from "@/utils/date_format";

Element.prototype.scrollIntoView = () => {};

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
  document.body.innerHTML = "";
  set_display_time_zone(undefined);
  vi.useRealTimers();
});

function button_with_text(text: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  );

  if (!match) throw new Error(`button "${text}" not found`);

  return match as HTMLButtonElement;
}

async function open_custom_picker(scheduled_time: Date, on_schedule = vi.fn()) {
  await act(async () => {
    root.render(
      <SchedulePicker
        force_picker
        on_schedule={on_schedule}
        scheduled_time={scheduled_time}
      />,
    );
  });

  await act(async () => {
    container.querySelector("button")!.click();
  });

  await act(async () => {
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.startsWith("mail.pick_date_time"))!
      .click();
  });

  return on_schedule;
}

describe("SchedulePicker custom time on the last day of the window", () => {
  it("disables Schedule and explains why past the 28-day cutoff", async () => {
    const on_schedule = await open_custom_picker(
      new Date("2026-10-31T15:00:00Z"),
    );

    const schedule = button_with_text("mail.schedule");

    expect(schedule.disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "common.scheduled_too_far_ahead",
    );

    await act(async () => {
      schedule.click();
    });

    expect(on_schedule).not.toHaveBeenCalled();
  });

  it("follows the instant across the DST change, not the wall clock", async () => {
    const at_cutoff = await open_custom_picker(
      new Date("2026-10-31T13:00:00Z"),
    );

    const schedule = button_with_text("mail.schedule");

    expect(schedule.disabled).toBe(false);
    expect(document.body.textContent).not.toContain(
      "common.scheduled_too_far_ahead",
    );

    await act(async () => {
      schedule.click();
    });

    expect(at_cutoff).toHaveBeenCalledWith(new Date("2026-10-31T13:00:00Z"));
  });

  it("disables hours that fall after the cutoff on the last day", async () => {
    await open_custom_picker(new Date("2026-10-31T09:00:00Z"));

    expect(button_with_text("mail.schedule").disabled).toBe(false);

    const hour_trigger = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "9 common.am",
    )!;

    await act(async () => {
      hour_trigger.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    });

    const items = Array.from(
      document.querySelectorAll('[role="menuitem"]'),
    ) as HTMLElement[];
    const state_of = (label: string) =>
      items
        .find((item) => item.textContent?.trim() === label)
        ?.hasAttribute("data-disabled");

    expect(items).toHaveLength(24);
    expect(state_of("1 common.pm")).toBe(false);
    expect(state_of("2 common.pm")).toBe(true);
    expect(state_of("11 common.pm")).toBe(true);
  });

  it("pulls the minute back to the cutoff when the hour moves onto it", async () => {
    await open_custom_picker(new Date("2026-10-31T12:55:00Z"));

    const hour_trigger = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "12 common.pm",
    )!;

    await act(async () => {
      hour_trigger.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    });

    const one_pm = Array.from(
      document.querySelectorAll('[role="menuitem"]'),
    ).find((item) => item.textContent?.trim() === "1 common.pm") as HTMLElement;

    await act(async () => {
      one_pm.click();
    });

    const schedule = button_with_text("mail.schedule");

    expect(button_with_text("1 common.pm")).toBeTruthy();
    expect(button_with_text("00")).toBeTruthy();
    expect(schedule.disabled).toBe(false);
    expect(document.body.textContent).not.toContain(
      "common.scheduled_too_far_ahead",
    );
  });

  it("keeps every hour available the day before the last day", async () => {
    await open_custom_picker(new Date("2026-10-30T22:00:00Z"));

    expect(button_with_text("mail.schedule").disabled).toBe(false);
    expect(document.body.textContent).not.toContain(
      "common.scheduled_too_far_ahead",
    );
  });
});
