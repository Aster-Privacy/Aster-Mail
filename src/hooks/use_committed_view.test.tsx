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
import { act, render_hook } from "@/tests/render_hook";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VIEW_COMMIT_HOLD_MS, use_committed_view } from "./use_committed_view";

describe("use_committed_view", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("switches in the same render when the target view is ready", () => {
    const prefetch = vi.fn(() => Promise.resolve(true));
    const { result, rerender } = render_hook(
      ({ view }) => use_committed_view(view, () => true, prefetch),
      { initialProps: { view: "inbox" } },
    );

    rerender({ view: "sent" });

    expect(result.current).toBe("sent");
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("keeps the previous view until the target finishes loading", async () => {
    let finish: (value: boolean) => void = () => {};
    const prefetch = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const { result, rerender } = render_hook(
      ({ view }) => use_committed_view(view, () => false, prefetch),
      { initialProps: { view: "inbox" } },
    );

    rerender({ view: "folder-abc" });
    expect(result.current).toBe("inbox");
    expect(prefetch).toHaveBeenCalledWith("folder-abc");

    await act(async () => {
      finish(true);
    });

    expect(result.current).toBe("folder-abc");
  });

  it("commits after the hold time when loading is slow", () => {
    const prefetch = vi.fn(() => new Promise<boolean>(() => {}));
    const { result, rerender } = render_hook(
      ({ view }) => use_committed_view(view, () => false, prefetch),
      { initialProps: { view: "inbox" } },
    );

    rerender({ view: "tag-xyz" });
    act(() => {
      vi.advanceTimersByTime(VIEW_COMMIT_HOLD_MS - 1);
    });
    expect(result.current).toBe("inbox");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("tag-xyz");
  });

  it("follows the latest target when the view changes again while held", async () => {
    const resolvers = new Map<string, (value: boolean) => void>();
    const prefetch = vi.fn(
      (view: string) =>
        new Promise<boolean>((resolve) => {
          resolvers.set(view, resolve);
        }),
    );
    const { result, rerender } = render_hook(
      ({ view }) => use_committed_view(view, () => false, prefetch),
      { initialProps: { view: "inbox" } },
    );

    rerender({ view: "folder-a" });
    rerender({ view: "folder-b" });

    await act(async () => {
      resolvers.get("folder-a")?.(true);
    });
    expect(result.current).toBe("inbox");

    await act(async () => {
      resolvers.get("folder-b")?.(true);
    });
    expect(result.current).toBe("folder-b");
  });
});
