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
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context_menu";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let observer: MutationObserver | null = null;
let transforms: string[] = [];

const WRAPPER = "[data-radix-popper-content-wrapper]";

function record(style: string | null): void {
  const match = /transform:\s*([^;]+)/.exec(style ?? "");

  if (match) transforms.push(match[1].trim());
}

function placed_points(): Array<{ x: number; y: number }> {
  return transforms
    .map((value) => /^translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)$/.exec(value))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
}

const ANCHOR_TOLERANCE = 8;

function expect_near(
  points: Array<{ x: number; y: number }>,
  x: number,
  y: number,
): void {
  expect(points.length).toBeGreaterThan(0);
  for (const point of points) {
    expect(Math.abs(point.x - x)).toBeLessThanOrEqual(ANCHOR_TOLERANCE);
    expect(Math.abs(point.y - y)).toBeLessThanOrEqual(ANCHOR_TOLERANCE);
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function right_click(x: number, y: number): Promise<void> {
  transforms = [];
  const row = container!.querySelector("[data-row]")!;

  await act(async () => {
    row.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }),
    );
  });
  await settle();

  const wrapper = document.querySelector(WRAPPER);

  if (wrapper) record(wrapper.getAttribute("style"));
}

async function press_escape(): Promise<void> {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  await settle();
}

beforeEach(() => {
  transforms = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  observer = new MutationObserver((records) => {
    for (const entry of records) {
      const target = entry.target as Element;

      if (entry.type === "attributes" && target.matches?.(WRAPPER)) {
        record(entry.oldValue);
        record(target.getAttribute("style"));
      }

      entry.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        const wrapper = node.matches(WRAPPER)
          ? node
          : node.querySelector(WRAPPER);

        if (wrapper) record(wrapper.getAttribute("style"));
      });
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style"],
    attributeOldValue: true,
  });

  act(() => {
    root!.render(
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <div data-row="">row</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Reply</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );
  });
});

afterEach(() => {
  observer?.disconnect();
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  observer = null;
});

describe("context menu anchor", () => {
  it("never places the first menu at the top left corner", async () => {
    await right_click(240, 320);

    expect(document.querySelector('[role="menu"]')).not.toBeNull();

    expect_near(placed_points(), 240, 320);
  });

  it("never places a reopened menu at the previous click point", async () => {
    await right_click(240, 320);
    await press_escape();

    expect(document.querySelector('[role="menu"]')).toBeNull();

    await right_click(600, 500);

    expect(document.querySelector('[role="menu"]')).not.toBeNull();

    expect_near(placed_points(), 600, 500);
  });

  it("keeps calling the open change handler", async () => {
    const calls: boolean[] = [];

    act(() => {
      root!.render(
        <ContextMenu modal={false} onOpenChange={(open) => calls.push(open)}>
          <ContextMenuTrigger asChild>
            <div data-row="">row</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Reply</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>,
      );
    });

    await right_click(100, 100);
    await press_escape();

    expect(calls).toEqual([true, false]);
  });
});
