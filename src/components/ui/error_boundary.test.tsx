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
import { act, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { ErrorBoundary } from "./error_boundary";

import { report_client_error } from "@/services/error_reporter";

vi.hoisted(() => {
  Object.defineProperty(document, "createEvent", {
    value: undefined,
    configurable: true,
  });
});

Reflect.deleteProperty(document, "createEvent");

vi.mock("@/services/error_reporter", async (import_original) => ({
  ...(await import_original<typeof import("@/services/error_reporter")>()),
  report_client_error: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/utils/open_link", () => ({
  open_external: vi.fn(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Thrower(): null {
  throw new TypeError("render failed");
}

function FloatingPanel() {
  return createPortal(
    <div data-testid="floating_panel">panel</div>,
    document.body,
  );
}

let container: HTMLDivElement;
let root: Root;
let console_error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(report_client_error).mockClear();
  console_error = vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document
    .querySelectorAll('[data-testid="floating_panel"]')
    .forEach((node) => node.remove());
  console_error.mockRestore();
});

describe("ErrorBoundary", () => {
  it("shows a visible fallback instead of a blank screen", () => {
    act(() => {
      root.render(
        <ErrorBoundary>
          <Thrower />
        </ErrorBoundary>,
      );
    });

    expect(container.textContent).toContain("common.something_went_wrong");
    expect(container.querySelector("button")).not.toBeNull();
  });

  it("reports the error kind without any message text", () => {
    act(() => {
      root.render(
        <ErrorBoundary fallback={null}>
          <Thrower />
        </ErrorBoundary>,
      );
    });

    expect(report_client_error).toHaveBeenCalledWith({
      feature: "react_render",
      error_code: "type_error",
    });
  });

  it("recovers from a portal removed outside React and reports it", () => {
    let set_open: (value: boolean) => void = () => undefined;

    function Host() {
      const [open, set] = useState(true);

      set_open = set;

      return (
        <ErrorBoundary fallback={<p>recovered</p>}>
          {open ? (
            <section>
              <FloatingPanel />
            </section>
          ) : (
            <p>closed</p>
          )}
        </ErrorBoundary>
      );
    }

    act(() => root.render(<Host />));
    document.querySelector('[data-testid="floating_panel"]')!.remove();
    act(() => set_open(false));

    expect(container.textContent).toBe("recovered");
    expect(report_client_error).toHaveBeenCalledWith({
      feature: "react_render",
      error_code: expect.stringMatching(/^(not_found|error)$/),
    });
  });

  it("clears the error when the reset key changes", () => {
    let fail = true;

    function MaybeThrow() {
      if (fail) throw new TypeError("render failed");

      return <p>back</p>;
    }

    act(() => {
      root.render(
        <ErrorBoundary fallback={null} reset_key="/inbox">
          <MaybeThrow />
        </ErrorBoundary>,
      );
    });
    expect(container.textContent).toBe("");

    fail = false;
    act(() => {
      root.render(
        <ErrorBoundary fallback={null} reset_key="/sent">
          <MaybeThrow />
        </ErrorBoundary>,
      );
    });
    expect(container.textContent).toBe("back");
  });
});
