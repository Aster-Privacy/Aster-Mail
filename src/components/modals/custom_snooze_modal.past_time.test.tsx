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

vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    is_open,
    children,
  }: {
    is_open: boolean;
    children: React.ReactNode;
  }) => (is_open ? <div>{children}</div> : null),
  ModalHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (date: Date) => void }) => (
    <button type="button" onClick={() => onSelect(new Date(2026, 9, 25))}>
      pick_day
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown_menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: () => null,
  DropdownMenuItem: () => null,
}));

import { CustomSnoozeModal } from "@/components/modals/custom_snooze_modal";
import { set_display_time_zone } from "@/utils/date_format";

const BEFORE_NINE = new Date("2026-10-25T08:59:00Z");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_NINE);
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

function button_with_text(text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  );

  if (!match) throw new Error(`button "${text}" not found`);

  return match as HTMLButtonElement;
}

async function open_and_pick_nine(on_snooze = vi.fn(async () => true)) {
  const on_close = vi.fn();

  await act(async () => {
    root.render(
      <CustomSnoozeModal is_open on_close={on_close} on_snooze={on_snooze} />,
    );
  });

  await act(async () => {
    button_with_text("pick_day").click();
  });

  return { on_snooze, on_close };
}

describe("CustomSnoozeModal with a time that passes while open", () => {
  it("snoozes to the chosen time while it is still in the future", async () => {
    const { on_snooze, on_close } = await open_and_pick_nine();
    const snooze = button_with_text("mail.snooze");

    expect(snooze.disabled).toBe(false);
    expect(container.textContent).not.toContain(
      "mail_rules.snooze_needs_future",
    );

    await act(async () => {
      snooze.click();
    });

    expect(on_snooze).toHaveBeenCalledWith(new Date("2026-10-25T09:00:00Z"));
    expect(on_close).toHaveBeenCalled();
  });

  it("disables Snooze and explains why once the time passes", async () => {
    const { on_snooze } = await open_and_pick_nine();

    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    const snooze = button_with_text("mail.snooze");

    expect(snooze.disabled).toBe(true);
    expect(container.textContent).toContain("mail_rules.snooze_needs_future");

    await act(async () => {
      snooze.click();
    });

    expect(on_snooze).not.toHaveBeenCalled();
  });

  it("rechecks at submit when the clock moved without a timer firing", async () => {
    const { on_snooze, on_close } = await open_and_pick_nine();

    vi.setSystemTime(new Date("2026-10-25T09:01:00Z"));

    await act(async () => {
      button_with_text("mail.snooze").click();
    });

    expect(on_snooze).not.toHaveBeenCalled();
    expect(on_close).not.toHaveBeenCalled();
    expect(container.textContent).toContain("mail_rules.snooze_needs_future");
    expect(button_with_text("mail.snooze").disabled).toBe(true);
  });
});
