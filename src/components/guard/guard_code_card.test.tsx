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
import type { GuardDevice } from "@/services/guard/guard_device";

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ tauri: false, copied: [] as string[] }));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/native/desktop_device_auth", () => ({ is_tauri: () => h.tauri }));

vi.mock("@/utils/copy_text", () => ({
  copy_text: vi.fn(async (value: string) => {
    h.copied.push(value);

    return true;
  }),
}));

import {
  GUARD_CLIPBOARD_CLEAR_MS,
  GuardCodeCard,
} from "@/components/guard/guard_code_card";

const clipboard = {
  readText: vi.fn(async () => "PV9M4"),
  writeText: vi.fn(async () => undefined),
};

function device_with(secret: string | null): GuardDevice {
  return {
    code_secret: async () =>
      secret === null ? null : new TextEncoder().encode(secret),
  } as unknown as GuardDevice;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

function render(node: ReactNode) {
  act(() => {
    root.render(node);
  });
}

function by_test_id(id: string): Element | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

function click_text(text: string) {
  const found = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );

  if (!found) throw new Error(`no button ${text}`);
  act(() => found.click());
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(59_000);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.tauri = false;
  h.copied = [];
  clipboard.readText.mockClear();
  clipboard.writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("GuardCodeCard", () => {
  it("shows the code with a countdown", async () => {
    render(<GuardCodeCard device={device_with("12345678901234567890")} />);
    await flush();
    expect(by_test_id("guard_code_value")?.textContent).toBe("PV9M4");
  });

  it("shows the unavailable text without a secret", async () => {
    render(<GuardCodeCard device={device_with(null)} />);
    await flush();
    expect(container.textContent).toContain("guard.code_unavailable");
    expect(by_test_id("guard_code_value")).toBeNull();
  });

  it("clears the clipboard after 30 s on desktop", async () => {
    h.tauri = true;
    render(<GuardCodeCard device={device_with("12345678901234567890")} />);
    await flush();
    click_text("guard.code_copy");
    await flush();
    expect(h.copied).toEqual(["PV9M4"]);
    await act(async () => {
      vi.advanceTimersByTime(GUARD_CLIPBOARD_CLEAR_MS);
    });
    await flush();
    expect(clipboard.writeText).toHaveBeenCalledWith("");
  });

  it("leaves the clipboard alone on the web", async () => {
    render(<GuardCodeCard device={device_with("12345678901234567890")} />);
    await flush();
    click_text("guard.code_copy");
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(GUARD_CLIPBOARD_CLEAR_MS);
    });
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });
});
