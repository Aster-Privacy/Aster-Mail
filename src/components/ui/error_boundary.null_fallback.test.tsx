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
import { act, lazy, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./error_boundary";

let container: HTMLDivElement;
let root: Root;

function Broken(): JSX.Element {
  throw new Error("modal failed");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("ErrorBoundary with a null fallback", () => {
  it("renders nothing for the failed part and keeps its siblings", () => {
    act(() => {
      root.render(
        <>
          <ErrorBoundary fallback={null}>
            <Broken />
          </ErrorBoundary>
          <p>inbox</p>
        </>,
      );
    });

    expect(container.innerHTML).toBe("<p>inbox</p>");
  });

  it("contains a lazy component whose module fails to load", async () => {
    const Missing = lazy(() => Promise.reject(new Error("module failed")));

    await act(async () => {
      root.render(
        <>
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <Missing />
            </Suspense>
          </ErrorBoundary>
          <p>inbox</p>
        </>,
      );
    });

    expect(container.innerHTML).toBe("<p>inbox</p>");
  });
});
