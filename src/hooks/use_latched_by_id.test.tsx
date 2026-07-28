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
import { describe, it, expect } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { use_latched_by_id } from "@/hooks/use_latched_by_id";

function Probe({
  id,
  value,
  seen,
}: {
  id: string;
  value: string | undefined;
  seen: (value: string | undefined) => void;
}) {
  seen(use_latched_by_id(id, value));

  return null;
}

describe("use_latched_by_id", () => {
  it("ignores a value that arrives after the first render for the same id", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const seen: (string | undefined)[] = [];

    act(() => {
      root.render(<Probe id="a" seen={(v) => seen.push(v)} value={undefined} />);
    });

    act(() => {
      root.render(
        <Probe id="a" seen={(v) => seen.push(v)} value="late-arrival" />,
      );
    });

    expect(seen.every((v) => v === undefined)).toBe(true);

    act(() => {
      root.render(
        <Probe id="b" seen={(v) => seen.push(v)} value="late-arrival" />,
      );
    });

    expect(seen[seen.length - 1]).toBe("late-arrival");

    act(() => root.unmount());
  });

  it("keeps the value present at the first render for an id", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const seen: (string | undefined)[] = [];

    act(() => {
      root.render(<Probe id="a" seen={(v) => seen.push(v)} value="first" />);
    });

    act(() => {
      root.render(<Probe id="a" seen={(v) => seen.push(v)} value="second" />);
    });

    expect(seen).toEqual(["first", "first"]);

    act(() => root.unmount());
  });
});
