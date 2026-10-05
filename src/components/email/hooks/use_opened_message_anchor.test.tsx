//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  opened_message_is_collapsed,
  use_opened_message_anchor,
} from "./use_opened_message_anchor";

const ROW_HEIGHT = 120;
const SCROLLER_TOP = 50;

let root: Root;
let host: HTMLDivElement;
let scroller: HTMLDivElement;
let original_rect: typeof HTMLElement.prototype.getBoundingClientRect;

function List({ ids, opened }: { ids: string[]; opened?: string }) {
  const register_row = use_opened_message_anchor(opened, ids.join(","));

  return (
    <div data-scroller style={{ overflowY: "auto" }}>
      <div>
        {ids.map((id) => (
          <div key={id} ref={(el) => register_row(id, el)} data-row={id} />
        ))}
      </div>
    </div>
  );
}

function render(ids: string[], opened: string | undefined = "opened"): void {
  act(() => {
    root.render(<List ids={ids} opened={opened} />);
  });
  scroller = host.querySelector("[data-scroller]") as HTMLDivElement;
}

describe("use_opened_message_anchor", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    original_rect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (): DOMRect {
      const scroll_host = this.closest("[data-scroller]") as HTMLElement | null;
      let top = SCROLLER_TOP;

      if (this.hasAttribute("data-row") && scroll_host) {
        const rows = Array.from(scroll_host.querySelectorAll("[data-row]"));

        top += rows.indexOf(this) * ROW_HEIGHT - scroll_host.scrollTop;
      }

      return { top } as DOMRect;
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    HTMLElement.prototype.getBoundingClientRect = original_rect;
  });

  it("keeps the opened message in place when earlier messages load above it", () => {
    render(["opened"]);
    expect(scroller.scrollTop).toBe(0);

    render(["a", "b", "c", "opened"]);

    expect(scroller.scrollTop).toBe(3 * ROW_HEIGHT);
  });

  it("keeps the reader's scroll offset inside the opened message", () => {
    render(["opened"]);
    scroller.scrollTop = 40;

    render(["a", "opened", "z"]);

    expect(scroller.scrollTop).toBe(40 + ROW_HEIGHT);
  });

  it("does not scroll when the conversation loads below the opened message", () => {
    render(["opened"]);
    render(["opened", "y", "z"]);

    expect(scroller.scrollTop).toBe(0);
  });

  it("does not scroll when a later reply arrives in a loaded conversation", () => {
    render(["opened"]);
    render(["a", "opened"]);
    scroller.scrollTop = 500;

    render(["new", "a", "opened"]);

    expect(scroller.scrollTop).toBe(500);
  });

  it("does not scroll a conversation that opens fully loaded", () => {
    render(["a", "b", "opened"]);
    render(["a", "b", "opened", "z"]);

    expect(scroller.scrollTop).toBe(0);
  });

  it("does nothing without an opened message", () => {
    render(["only"], undefined);
    render(["a", "only"], undefined);

    expect(scroller.scrollTop).toBe(0);
  });
});

describe("opened_message_is_collapsed", () => {
  it("is false for a short conversation", () => {
    expect(opened_message_is_collapsed(["a", "b", "c", "d"], "b")).toBe(false);
  });

  it("is true for a message in the collapsed middle group", () => {
    expect(opened_message_is_collapsed(["a", "b", "c", "d", "e"], "b")).toBe(
      true,
    );
    expect(opened_message_is_collapsed(["a", "b", "c", "d", "e"], "c")).toBe(
      true,
    );
  });

  it("is false for the first message and the visible tail", () => {
    const ids = ["a", "b", "c", "d", "e"];

    expect(opened_message_is_collapsed(ids, "a")).toBe(false);
    expect(opened_message_is_collapsed(ids, "d")).toBe(false);
    expect(opened_message_is_collapsed(ids, "e")).toBe(false);
    expect(opened_message_is_collapsed(ids, "missing")).toBe(false);
  });
});
