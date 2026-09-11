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
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  consume_pending_settings_anchor,
  scroll_to_settings_anchor,
  set_pending_settings_anchor,
} from "./settings_anchor";

describe("settings anchor", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = "";
  });

  it("returns null when nothing is pending", () => {
    expect(consume_pending_settings_anchor()).toBeNull();
  });

  it("hands back a stored anchor exactly once", () => {
    set_pending_settings_anchor("sec-2fa");

    expect(consume_pending_settings_anchor()).toBe("sec-2fa");
    expect(consume_pending_settings_anchor()).toBeNull();
  });

  it("scrolls an element that is already mounted", async () => {
    const el = document.createElement("div");

    el.id = "sec-images";
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    scroll_to_settings_anchor("sec-images");
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("waits for a late-mounting element", async () => {
    scroll_to_settings_anchor("sec-passkeys", true);

    const el = document.createElement("div");

    el.id = "sec-passkeys";
    el.scrollIntoView = vi.fn();
    await new Promise((resolve) => setTimeout(resolve, 40));
    document.body.appendChild(el);
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("follows the anchor when content above it finishes loading", async () => {
    const container = document.createElement("div");
    const el = document.createElement("div");
    let el_top = 400;

    container.style.overflowY = "auto";
    Object.defineProperty(container, "scrollHeight", { value: 5000 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    container.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    container.scrollTo = vi.fn() as unknown as typeof container.scrollTo;
    el.id = "sec-devices";
    el.getBoundingClientRect = () => ({ top: el_top }) as DOMRect;
    container.appendChild(el);
    document.body.appendChild(container);

    scroll_to_settings_anchor("sec-devices", true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    el_top = 1100;
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(container.scrollTo).toHaveBeenNthCalledWith(1, {
      top: 376,
      behavior: "smooth",
    });
    expect(container.scrollTo).toHaveBeenLastCalledWith({
      top: 1076,
      behavior: "smooth",
    });
  });

  it("stops following the anchor once the user scrolls", async () => {
    const container = document.createElement("div");
    const el = document.createElement("div");
    let el_top = 400;

    container.style.overflowY = "auto";
    Object.defineProperty(container, "scrollHeight", { value: 5000 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    container.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    container.scrollTo = vi.fn() as unknown as typeof container.scrollTo;
    el.id = "sec-vanguard";
    el.getBoundingClientRect = () => ({ top: el_top }) as DOMRect;
    container.appendChild(el);
    document.body.appendChild(container);

    scroll_to_settings_anchor("sec-vanguard", true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    window.dispatchEvent(new Event("wheel"));
    el_top = 1100;
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(container.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("gives up quietly when the element never appears", async () => {
    expect(() => scroll_to_settings_anchor("sec-missing")).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
});
