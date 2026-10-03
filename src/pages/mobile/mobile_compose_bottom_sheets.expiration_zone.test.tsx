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

import { MobileExpirationSheet } from "@/pages/mobile/mobile_compose_bottom_sheets";
import { set_display_time_zone } from "@/utils/date_format";

const NOW = new Date("2026-10-03T13:00:00Z");

let container: HTMLDivElement;
let root: Root;
let device_zone: string | undefined;

beforeEach(() => {
  device_zone = process.env.TZ;
  process.env.TZ = "Pacific/Kiritimati";
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
  process.env.TZ = device_zone;
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

async function open_custom(on_set_expiration = vi.fn()) {
  await act(async () => {
    root.render(
      <MobileExpirationSheet
        is_open
        expiry_password={null}
        has_expires_at={false}
        has_external_recipients={false}
        on_clear={() => {}}
        on_close={() => {}}
        on_save_password={() => {}}
        on_set_expiration={on_set_expiration}
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

  return { on_set_expiration, date_input, time_input };
}

describe("MobileExpirationSheet custom date in the account time zone", () => {
  it("starts the date field at today in the account zone, not the device zone", async () => {
    const { date_input } = await open_custom();

    expect(date_input.min).toBe("2026-10-03");
  });

  it("sets the expiry at the picked wall time in the account zone", async () => {
    const { on_set_expiration, date_input, time_input } = await open_custom();

    await act(async () => {
      type_into(date_input, "2026-10-04");
      type_into(time_input, "09:30");
    });

    await act(async () => {
      button_with_text("common.confirm").click();
    });

    expect(on_set_expiration).toHaveBeenCalledTimes(1);
    expect(on_set_expiration.mock.calls[0][0].toISOString()).toBe(
      "2026-10-04T08:30:00.000Z",
    );
  });
});
