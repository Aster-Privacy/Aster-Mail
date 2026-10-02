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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { get_translations_async } from "@/lib/i18n/translations";
import { sync_tray_labels, update_tray_badge } from "@/native/tauri_tray";

const invoke_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

function mark_desktop(): void {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
}

function last_tooltip(): unknown {
  const calls = invoke_mock.mock.calls.filter(
    ([command]) => command === "set_tray_tooltip",
  );

  return (calls.at(-1)?.[1] as { tooltip?: string } | undefined)?.tooltip;
}

describe("tray unread tooltip", () => {
  beforeAll(async () => {
    await get_translations_async("pt");
  });

  beforeEach(() => {
    invoke_mock.mockReset();
    invoke_mock.mockResolvedValue(undefined);
    mark_desktop();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    localStorage.clear();
  });

  it("uses the singular for a single unread message", async () => {
    localStorage.setItem("astermail_language", "pt");

    await update_tray_badge(1);

    expect(last_tooltip()).toBe("Aster Mail - 1 não lida");
  });

  it("keeps the plural for other counts", async () => {
    localStorage.setItem("astermail_language", "pt");

    await update_tray_badge(3);

    expect(last_tooltip()).toBe("Aster Mail - 3 não lidas");
  });

  it("shows no count at zero and keeps English working", async () => {
    localStorage.setItem("astermail_language", "pt");

    await update_tray_badge(0);

    expect(last_tooltip()).toBe("Aster Mail");

    localStorage.setItem("astermail_language", "en");

    await update_tray_badge(1);

    expect(last_tooltip()).toBe("Aster Mail - 1 unread");
  });

  it("re-sends the tooltip in the new language without a count change", async () => {
    localStorage.setItem("astermail_language", "pt");

    await update_tray_badge(3);

    expect(last_tooltip()).toBe("Aster Mail - 3 não lidas");

    invoke_mock.mockClear();
    localStorage.setItem("astermail_language", "en");

    await sync_tray_labels();

    expect(last_tooltip()).toBe("Aster Mail - 3 unread");
    expect(invoke_mock).toHaveBeenCalledWith("set_unread_badge", { count: 3 });
  });

  it("uses the new language's plural rules when re-sending", async () => {
    localStorage.setItem("astermail_language", "en");

    await update_tray_badge(1);

    expect(last_tooltip()).toBe("Aster Mail - 1 unread");

    localStorage.setItem("astermail_language", "pt");

    await sync_tray_labels();

    expect(last_tooltip()).toBe("Aster Mail - 1 não lida");
  });

  it("ends on the new language when the switch lands mid-flush", async () => {
    let release_badge: () => void = () => {};
    let badge_reached: () => void = () => {};
    const reached = new Promise<void>((resolve) => {
      badge_reached = resolve;
    });

    invoke_mock.mockImplementation((command: string) => {
      if (command !== "set_unread_badge") return Promise.resolve();

      badge_reached();

      return new Promise<void>((resolve) => {
        release_badge = resolve;
      });
    });

    localStorage.setItem("astermail_language", "pt");

    const in_flight = update_tray_badge(2);

    await reached;

    localStorage.setItem("astermail_language", "en");

    const labels_synced = sync_tray_labels();

    await vi.waitFor(() => {
      expect(invoke_mock).toHaveBeenCalledWith(
        "set_tray_labels",
        expect.anything(),
      );
    });
    release_badge();
    invoke_mock.mockImplementation(() => Promise.resolve());

    await Promise.all([in_flight, labels_synced]);

    expect(last_tooltip()).toBe("Aster Mail - 2 unread");
  });
});
