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

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

const { WebSandboxNotice } = await import("./web_sandbox_notice");
const { WEB_SANDBOX_NOTICE_KEY } = await import(
  "@/services/desktop/web_sandbox_status"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("WebSandboxNotice", () => {
  let container: HTMLDivElement;
  let root: Root;

  const mount = async () => {
    await act(async () => {
      root.render(<WebSandboxNotice />);
    });
    await act(async () => {});
  };

  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    (
      window as unknown as { __TAURI_INTERNALS__?: unknown }
    ).__TAURI_INTERNALS__ = {};
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
  });

  it("shows the notice when the sandbox is off and hides it for good once dismissed", async () => {
    invoke.mockResolvedValue({ enabled: false, reason: "probe_failed" });
    await mount();

    expect(container.textContent).toContain("common.web_sandbox_off_title");
    expect(container.textContent).toContain("common.web_sandbox_off_body");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="common.dismiss"]')
        ?.click();
    });

    expect(container.textContent).toBe("");
    expect(localStorage.getItem(WEB_SANDBOX_NOTICE_KEY)).toBe("1");

    act(() => root.unmount());
    root = createRoot(container);
    invoke.mockClear();
    await mount();

    expect(container.textContent).toBe("");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("stays hidden when the sandbox is on", async () => {
    invoke.mockResolvedValue({ enabled: true, reason: "probe_passed" });
    await mount();

    expect(container.textContent).toBe("");
  });

  it("stays hidden in a browser", async () => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
    await mount();

    expect(container.textContent).toBe("");
    expect(invoke).not.toHaveBeenCalled();
  });
});
