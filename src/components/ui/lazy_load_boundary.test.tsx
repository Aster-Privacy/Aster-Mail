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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, Component, Suspense, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const recovery = vi.hoisted(() => ({ trigger: vi.fn(() => true) }));

vi.mock("@/lib/chunk_recovery", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/chunk_recovery")>()),
  trigger_chunk_recovery: recovery.trigger,
}));

const { LazyLoadBoundary } = await import("./lazy_load_boundary");
const { lazy_on_demand } = await import("@/utils/lazy_with_retry");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CHUNK_ERROR = new TypeError(
  "Failed to fetch dynamically imported module: /assets/compose_window.js",
);

class OuterBoundary extends Component<
  { children: ReactNode; on_error: (error: Error) => void },
  { has_error: boolean }
> {
  state = { has_error: false };

  static getDerivedStateFromError(): { has_error: boolean } {
    return { has_error: true };
  }

  componentDidCatch(error: Error): void {
    this.props.on_error(error);
  }

  render(): ReactNode {
    if (this.state.has_error) return <div data-testid="app-error" />;

    return this.props.children;
  }
}

function Loaded() {
  return <div data-testid="loaded" />;
}

function Crashing(): never {
  throw new Error("render failed");
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(
  child: ReactNode,
  on_load_error: () => void,
  on_app_error: (error: Error) => void,
): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <OuterBoundary on_error={on_app_error}>
        <LazyLoadBoundary on_load_error={on_load_error}>
          <Suspense fallback={<div data-testid="loading" />}>{child}</Suspense>
        </LazyLoadBoundary>
      </OuterBoundary>,
    );
  });

  return container;
}

function unmount(): void {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
}

afterEach(() => {
  unmount();
  recovery.trigger.mockClear();
  vi.restoreAllMocks();
});

describe("LazyLoadBoundary", () => {
  it("reports a module that did not load without reloading the app", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const import_fn = vi.fn(() =>
      Promise.reject<{ default: typeof Loaded }>(CHUNK_ERROR),
    );
    const OnDemand = lazy_on_demand(import_fn, 1, 0);
    const on_load_error = vi.fn();
    const on_app_error = vi.fn();
    const view = await render(<OnDemand />, on_load_error, on_app_error);

    await vi.waitFor(async () => {
      await act(async () => {});
      expect(on_load_error).toHaveBeenCalledTimes(1);
    });

    expect(import_fn).toHaveBeenCalledTimes(2);
    expect(view.querySelector('[data-testid="loaded"]')).toBeNull();
    expect(view.querySelector('[data-testid="loading"]')).toBeNull();
    expect(view.querySelector('[data-testid="app-error"]')).toBeNull();
    expect(on_app_error).not.toHaveBeenCalled();
    expect(recovery.trigger).not.toHaveBeenCalled();
  });

  it("loads the module when the user tries again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const import_fn = vi
      .fn<() => Promise<{ default: typeof Loaded }>>()
      .mockRejectedValueOnce(CHUNK_ERROR)
      .mockResolvedValue({ default: Loaded });
    const OnDemand = lazy_on_demand(import_fn, 0, 0);
    const on_load_error = vi.fn();

    await render(<OnDemand />, on_load_error, vi.fn());
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(on_load_error).toHaveBeenCalledTimes(1);
    });

    unmount();

    const view = await render(<OnDemand />, on_load_error, vi.fn());

    await vi.waitFor(async () => {
      await act(async () => {});
      expect(view.querySelector('[data-testid="loaded"]')).not.toBeNull();
    });

    expect(on_load_error).toHaveBeenCalledTimes(1);
    expect(recovery.trigger).not.toHaveBeenCalled();
  });

  it("passes a render crash on to the app error handling", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const OnDemand = lazy_on_demand(
      () => Promise.resolve({ default: Crashing }),
      0,
      0,
    );
    const on_load_error = vi.fn();
    const on_app_error = vi.fn();
    const view = await render(<OnDemand />, on_load_error, on_app_error);

    await vi.waitFor(async () => {
      await act(async () => {});
      expect(on_app_error).toHaveBeenCalledTimes(1);
    });

    expect(on_app_error.mock.calls[0][0].message).toBe("render failed");
    expect(on_load_error).not.toHaveBeenCalled();
    expect(view.querySelector('[data-testid="app-error"]')).not.toBeNull();
  });
});
