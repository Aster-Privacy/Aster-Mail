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
import { describe, it, expect, vi } from "vitest";

vi.mock("@/contexts/theme_context", () => ({ useTheme: () => ({ theme: "dark" }) }));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
  FONT_SIZE_DEFAULT: 14,
  normalize_font_size_scale: (value: number) => value,
}));
vi.mock("@/lib/i18n/context", () => ({ use_i18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/services/api/client", () => ({
  api_client: { get_access_token: () => null },
}));
vi.mock("@/services/routing/routing_provider", () => ({ routed_fetch: vi.fn() }));
vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct", get_api_onion_url: () => null },
}));

const {
  should_recover_collapsed_height,
  body_has_renderable_content,
  measure_content_bounds,
} = await import("./sandboxed_email_renderer");

const with_layout = (el: Element, top: number, bottom: number, scroll: number) => {
  el.getBoundingClientRect = () =>
    ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top }) as DOMRect;
  Object.defineProperty(el, "scrollHeight", { value: scroll, configurable: true });
};

describe("should_recover_collapsed_height", () => {
  it("recovers a receipt whose wrapper measured to nothing", () => {
    expect(should_recover_collapsed_height(0, true)).toBe(true);
    expect(should_recover_collapsed_height(1, true)).toBe(true);
  });

  it("leaves an empty body collapsed", () => {
    expect(should_recover_collapsed_height(0, false)).toBe(false);
  });

  it("leaves a normally measured email alone", () => {
    expect(should_recover_collapsed_height(109, true)).toBe(false);
    expect(should_recover_collapsed_height(12000, true)).toBe(false);
  });
});

describe("body_has_renderable_content", () => {
  it("sees text", () => {
    const body = document.createElement("body");
    body.innerHTML = "<div><p>Order 41398</p></div>";
    expect(body_has_renderable_content(body)).toBe(true);
  });

  it("sees an image-only receipt", () => {
    const body = document.createElement("body");
    body.innerHTML = '<div><img src="x" /></div>';
    expect(body_has_renderable_content(body)).toBe(true);
  });

  it("reports nothing for an empty body", () => {
    const body = document.createElement("body");
    body.innerHTML = "<div>   </div>";
    expect(body_has_renderable_content(body)).toBe(false);
  });
});

describe("measure_content_bounds", () => {
  it("finds the deepest descendant of a collapsed wrapper", () => {
    const body = document.createElement("body");
    body.innerHTML = "<div><p>a</p><p>b</p></div>";

    const wrapper = body.firstElementChild as Element;
    with_layout(wrapper, 0, 0, 0);
    with_layout(wrapper.children[0], 0, 40, 40);
    with_layout(wrapper.children[1], 40, 123, 83);

    expect(measure_content_bounds(body)).toBe(123);
  });

  it("uses scroll height when a child is clipped", () => {
    const body = document.createElement("body");
    body.innerHTML = "<div></div>";

    const clipped = body.firstElementChild as Element;
    with_layout(clipped, 0, 1, 123);

    expect(measure_content_bounds(body)).toBe(123);
  });

  it("returns nothing for a body with no children", () => {
    expect(measure_content_bounds(document.createElement("body"))).toBe(0);
  });
});
