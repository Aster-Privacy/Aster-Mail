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
import type { ToastPosition } from "./toast_position";

import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let toast_position = "bottom";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { toast_position } }),
}));

const { ActionToast, show_action_toast, hide_action_toast } = await import(
  "./action_toast"
);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(position?: ToastPosition) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<ActionToast position={position} />);
  });
  act(() => {
    show_action_toast({
      message: "moved",
      action_type: "archive",
      email_ids: [],
      duration_ms: 60000,
    });
  });

  const element = host.querySelector<HTMLElement>("div.fixed");

  if (!element) throw new Error("toast not rendered");

  return element;
}

afterEach(() => {
  act(() => hide_action_toast());
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  toast_position = "bottom";
});

describe("action toast position", () => {
  it("anchors to the bottom center by default", () => {
    const element = mount();

    expect(element.className).toContain("left-1/2");
    expect(element.style.bottom).toBe("24px");
  });

  it("follows the notification position preference", () => {
    toast_position = "top-right";
    const element = mount();

    expect(element.className).toContain("right-4");
    expect(element.className).not.toContain("left-1/2");
    expect(element.style.bottom).toBe("");
  });

  it("honors an explicit position override", () => {
    toast_position = "top-right";
    const element = mount("bottom-left");

    expect(element.className).toContain("left-4");
    expect(element.style.bottom).toBe("24px");
  });
});
