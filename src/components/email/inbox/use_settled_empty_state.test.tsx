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
import { useState } from "react";

import {
  EMPTY_COMMIT_GRACE_MS,
  use_settled_empty_state,
} from "./use_settled_empty_state";

interface Props {
  view_key: string;
  is_empty: boolean;
  is_settled: boolean;
}

function render_state(initial: Props) {
  return render_hook((props: Props) => use_settled_empty_state(props), {
    initialProps: initial,
  });
}

describe("use_settled_empty_state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the empty state in the same render when a view loads empty", () => {
    const { result, rerender } = render_state({
      view_key: "drafts",
      is_empty: true,
      is_settled: false,
    });

    expect(result.current).toBe(false);

    rerender({ view_key: "drafts", is_empty: true, is_settled: true });
    expect(result.current).toBe(true);
  });

  it("waits out the grace period when rows just left the view", () => {
    const { result, rerender } = render_state({
      view_key: "inbox",
      is_empty: false,
      is_settled: true,
    });

    rerender({ view_key: "inbox", is_empty: true, is_settled: true });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(EMPTY_COMMIT_GRACE_MS);
    });
    expect(result.current).toBe(true);
  });

  it("never shows the empty state while loading", () => {
    const { result } = render_state({
      view_key: "sent",
      is_empty: true,
      is_settled: false,
    });

    act(() => {
      vi.advanceTimersByTime(EMPTY_COMMIT_GRACE_MS * 3);
    });
    expect(result.current).toBe(false);
  });

  it("hides the empty state when rows arrive", () => {
    const { result, rerender } = render_state({
      view_key: "spam",
      is_empty: true,
      is_settled: true,
    });

    expect(result.current).toBe(true);
    rerender({ view_key: "spam", is_empty: false, is_settled: true });
    expect(result.current).toBe(false);
  });

  it("ignores stale rows from the previous view in a discarded render", () => {
    const { result, rerender } = render_hook(
      ({ view_key }: { view_key: string }) => {
        const [rows_key, set_rows_key] = useState(view_key);
        const [has_rows, set_has_rows] = useState(true);

        if (rows_key !== view_key) {
          set_rows_key(view_key);
          set_has_rows(false);
        }

        return use_settled_empty_state({
          view_key,
          is_empty: !has_rows,
          is_settled: true,
        });
      },
      { initialProps: { view_key: "primary" } },
    );

    expect(result.current).toBe(false);

    rerender({ view_key: "deals" });
    expect(result.current).toBe(true);
  });
});
