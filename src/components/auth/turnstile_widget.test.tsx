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
import type { TurnstileWidgetRef } from "./turnstile_widget";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/lib/onion_host", () => ({
  is_onion_host: () => false,
}));

vi.mock("@/native/desktop_device_auth", () => ({
  is_tauri: () => false,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let callbacks: Record<string, (token: string) => void>;
let reset_spy: ReturnType<typeof vi.fn<(widget_id: string) => void>>;
let original_append: typeof document.head.appendChild;

function install_turnstile_stub() {
  callbacks = {};
  reset_spy = vi.fn<(widget_id: string) => void>();
  window.turnstile = {
    render: (_element: HTMLElement, options: Record<string, unknown>) => {
      callbacks.verify = options.callback as (token: string) => void;

      return "widget-1";
    },
    reset: reset_spy,
    remove: vi.fn(),
  };

  original_append = document.head.appendChild.bind(document.head);
  document.head.appendChild = ((node: Node) => {
    const appended = original_append(node);

    if (node instanceof HTMLScriptElement) node.onload?.(new Event("load"));

    return appended;
  }) as typeof document.head.appendChild;
}

describe("TurnstileWidget refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "0x000000000000000000");
    install_turnstile_stub();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.head.appendChild = original_append;
    delete window.turnstile;
    vi.unstubAllEnvs();
  });

  it("resets the widget and resolves with the next token", async () => {
    const { TurnstileWidget } = await import("./turnstile_widget");
    const ref = createRef<TurnstileWidgetRef>();
    const on_verify = vi.fn();

    root = createRoot(container);
    await act(async () => {
      root.render(<TurnstileWidget ref={ref} on_verify={on_verify} />);
    });

    act(() => callbacks.verify("first-token"));
    expect(on_verify).toHaveBeenCalledWith("first-token");

    let resolved = "";
    const pending = ref.current?.refresh().then((token) => {
      resolved = token;
    });

    expect(reset_spy).toHaveBeenCalledWith("widget-1");

    await act(async () => {
      callbacks.verify("second-token");
      await pending;
    });

    expect(resolved).toBe("second-token");
    expect(on_verify).toHaveBeenLastCalledWith("second-token");
  });
});
