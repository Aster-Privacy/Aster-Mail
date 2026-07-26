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
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { use_mobile_experience } from "./use_mobile_experience";

function set_viewport(width: number, user_agent: string) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(navigator, "userAgent", {
    writable: true,
    configurable: true,
    value: user_agent,
  });
}

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function TestHarness({ on_value }: { on_value: (value: boolean) => void }) {
  const is_mobile = use_mobile_experience();

  on_value(is_mobile);

  return null;
}

function mount(on_value: (value: boolean) => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<TestHarness on_value={on_value} />);
  });
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  if (container) {
    container.remove();
  }
  root = null;
  container = null;
});

describe("use_mobile_experience", () => {
  it("reports the mobile shell for a narrow mobile-UA viewport", () => {
    set_viewport(390, ANDROID_UA);

    let latest = false;

    mount((value) => {
      latest = value;
    });

    expect(latest).toBe(true);
  });

  it("reports the desktop shell for a wide viewport even on a mobile UA", () => {
    set_viewport(1024, ANDROID_UA);

    let latest = false;

    mount((value) => {
      latest = value;
    });

    expect(latest).toBe(false);
  });

  it("re-evaluates reactively when the viewport narrows below the breakpoint", () => {
    set_viewport(1024, ANDROID_UA);

    let latest = false;

    mount((value) => {
      latest = value;
    });

    expect(latest).toBe(false);

    act(() => {
      set_viewport(390, ANDROID_UA);
      window.dispatchEvent(new Event("resize"));
    });

    expect(latest).toBe(true);
  });

  it("re-evaluates reactively when the viewport widens above the breakpoint", () => {
    set_viewport(390, ANDROID_UA);

    let latest = false;

    mount((value) => {
      latest = value;
    });

    expect(latest).toBe(true);

    act(() => {
      set_viewport(1024, ANDROID_UA);
      window.dispatchEvent(new Event("resize"));
    });

    expect(latest).toBe(false);
  });

  it("also reacts to orientationchange events", () => {
    set_viewport(1024, ANDROID_UA);

    let latest = false;

    mount((value) => {
      latest = value;
    });

    expect(latest).toBe(false);

    act(() => {
      set_viewport(390, ANDROID_UA);
      window.dispatchEvent(new Event("orientationchange"));
    });

    expect(latest).toBe(true);
  });
});
