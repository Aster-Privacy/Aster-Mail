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
import { update_tray_badge } from "@/native/tauri_tray";

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
});
