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

const NOW = new Date("2026-10-25T08:50:00Z");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  set_display_time_zone("UTC");
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

function find_button(predicate: (text: string) => boolean): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (button) => predicate(button.textContent?.trim() ?? ""),
  );

  if (!match) throw new Error("button not found");

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

async function render_sheet(is_open: boolean, on_schedule = vi.fn()) {
  await act(async () => {
    root.render(
      <MobileScheduleSheet
        has_scheduled_time={false}
        is_open={is_open}
        on_clear={() => {}}
        on_close={() => {}}
        on_schedule={on_schedule}
        t={(key) => key}
      />,
    );
  });

  return on_schedule;
}

describe("MobileScheduleSheet with time passing while open", () => {
  it("disables Confirm and explains why once the custom time passes", async () => {
    const on_schedule = await render_sheet(true);

    await act(async () => {
      find_button((text) => text === "mail.pick_date_time").click();
    });

    await act(async () => {
      type_into(
        container.querySelector('input[type="date"]') as HTMLInputElement,
        "2026-10-25",
      );
      type_into(
        container.querySelector('input[type="time"]') as HTMLInputElement,
        "09:00",
      );
    });

    const confirm = find_button((text) => text === "common.confirm");

    expect(confirm.disabled).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(11 * 60 * 1000);
    });

    expect(confirm.disabled).toBe(true);
    expect(container.textContent).toContain("mail_rules.snooze_needs_future");

    await act(async () => {
      confirm.click();
    });

    expect(on_schedule).not.toHaveBeenCalled();
  });

  it("computes quick options when the sheet opens, not when it mounts", async () => {
    const on_schedule = await render_sheet(false);

    vi.setSystemTime(NOW.getTime() + 3 * 60 * 60 * 1000);

    await render_sheet(true, on_schedule);

    await act(async () => {
      find_button((text) => text.startsWith("common.in_one_hour")).click();
    });

    expect(on_schedule).toHaveBeenCalledWith(
      new Date(NOW.getTime() + 4 * 60 * 60 * 1000),
    );
  });
});
