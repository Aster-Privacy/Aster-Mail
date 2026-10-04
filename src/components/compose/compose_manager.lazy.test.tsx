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
import type { ComposeInstance } from "./compose_manager";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const loader = vi.hoisted(() => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { count: 0, armed: false, gate, release: () => release() };
});

vi.mock("@/components/compose/compose_window", async () => {
  loader.count += 1;
  if (loader.armed) await loader.gate;

  return {
    ComposeWindow: ({
      instance_id,
      initial_to,
      on_close,
    }: {
      instance_id: string;
      initial_to?: string;
      on_close: () => void;
    }) => (
      <div data-instance={instance_id} data-testid="compose-window">
        <span>{initial_to}</span>
        <button type="button" onClick={on_close}>
          close
        </button>
      </div>
    ),
  };
});

vi.mock("@/lib/i18n/context", () => ({
  use_translation: () => ({ t: (key: string) => key }),
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { compose_window_mode: "default" } }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/services/iconic_sounds", () => ({
  play_iconic_sound: () => {},
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

const { ComposeManager } = await import("./compose_manager");

loader.armed = true;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let idle_callbacks: Array<() => void> = [];

function instance(id: string, initial_to: string): ComposeInstance {
  return { id, initial_to, is_minimized: false };
}

async function render(instances: ComposeInstance[], on_close = vi.fn()) {
  container ??= document.createElement("div");
  document.body.appendChild(container);
  root ??= createRoot(container);
  await act(async () => {
    root!.render(
      <ComposeManager
        instances={instances}
        on_close={on_close}
        on_toggle_minimize={() => {}}
      />,
    );
  });

  return container;
}

beforeEach(() => {
  idle_callbacks = [];
  vi.stubGlobal(
    "requestIdleCallback",
    vi.fn((callback: () => void) => {
      idle_callbacks.push(callback);

      return idle_callbacks.length;
    }),
  );
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("ComposeManager on demand loading", () => {
  it("does not load the compose window until a composer opens", async () => {
    await render([]);

    expect(loader.count).toBe(0);
    expect(idle_callbacks).toHaveLength(1);
  });

  it("shows a window-sized shell until the compose window arrives", async () => {
    const view = await render([instance("compose_1", "ada@example.com")]);

    const shell = view.querySelector<HTMLElement>('[role="status"]');

    expect(loader.count).toBe(1);
    expect(shell).not.toBeNull();
    expect(shell!.style.width).toBe("700px");
    expect(shell!.style.height).toBe("600px");
    expect(view.querySelector('[data-testid="compose-window"]')).toBeNull();

    loader.release();
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(
        view.querySelectorAll('[data-testid="compose-window"]'),
      ).toHaveLength(1);
    });

    const windows = view.querySelectorAll('[data-testid="compose-window"]');

    expect(windows[0].getAttribute("data-instance")).toBe("compose_1");
    expect(windows[0].textContent).toContain("ada@example.com");
    expect(view.querySelector('[role="status"]')).toBeNull();
  });

  it("reuses the loaded window for further composers", async () => {
    const on_close = vi.fn();
    const view = await render(
      [
        instance("compose_1", "ada@example.com"),
        instance("compose_2", "grace@example.com"),
      ],
      on_close,
    );

    expect(
      view.querySelectorAll('[data-testid="compose-window"]'),
    ).toHaveLength(2);
    expect(view.querySelector('[role="status"]')).toBeNull();
    expect(loader.count).toBe(1);

    await act(async () => {
      view.querySelector<HTMLButtonElement>("button")!.click();
    });

    expect(on_close).toHaveBeenCalledTimes(1);
  });
});
