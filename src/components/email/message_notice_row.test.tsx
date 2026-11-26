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
import type { BlockedItem } from "@/lib/html_sanitizer";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  MessageNoticeRow,
  external_content_action,
} from "./message_notice_row";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function items(...types: BlockedItem["type"][]): BlockedItem[] {
  return types.map((type, index) => ({
    url: `https://cdn.example.test/${index}`,
    type,
  }));
}

describe("external_content_action", () => {
  it("returns nothing when no content is blocked", () => {
    expect(external_content_action(undefined, true)).toBe(null);
    expect(external_content_action([], true)).toBe(null);
  });

  it("returns nothing when only tracking pixels are blocked", () => {
    expect(external_content_action(items("tracking_pixel"), true)).toBe(null);
  });

  it("loads every visible type in one action and keeps trackers blocked", () => {
    expect(
      external_content_action(
        items("image", "tracking_pixel", "font", "css", "image"),
        true,
      ),
    ).toEqual({ kind: "load", types: ["image", "font", "css"] });
  });

  it("points to image settings when images can't be granted per message", () => {
    expect(external_content_action(items("image", "css"), false)).toEqual({
      kind: "settings",
    });
  });

  it("still loads fonts and styles when images can't be granted", () => {
    expect(external_content_action(items("font", "css"), false)).toEqual({
      kind: "load",
      types: ["font", "css"],
    });
  });
});

describe("MessageNoticeRow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(props: Partial<Parameters<typeof MessageNoticeRow>[0]>) {
    const handlers = {
      on_load_external_content: vi.fn(),
      on_open_image_settings: vi.fn(),
      on_unsubscribe: vi.fn(),
      on_open_unsubscribe_page: vi.fn(),
    };

    act(() =>
      root.render(
        <MessageNoticeRow
          external_action={null}
          unsubscribe_state={null}
          {...handlers}
          {...props}
        />,
      ),
    );

    return handlers;
  }

  const by_id = (id: string) =>
    container.querySelector<HTMLButtonElement>(`[data-testid='${id}']`);

  it("renders nothing without a notice", () => {
    render({});

    expect(container.innerHTML).toBe("");
  });

  it("shows one control that loads all hidden content", () => {
    const handlers = render({
      external_action: { kind: "load", types: ["image", "css"] },
    });

    expect(container.textContent).toContain("mail.external_content_hidden");
    expect(
      container.querySelectorAll("[data-testid='load-external-content']"),
    ).toHaveLength(1);
    act(() => by_id("load-external-content")!.click());
    expect(handlers.on_load_external_content).toHaveBeenCalledWith([
      "image",
      "css",
    ]);
    expect(by_id("message-unsubscribe")).toBe(null);
  });

  it("opens image settings when images can't be loaded here", () => {
    const handlers = render({ external_action: { kind: "settings" } });

    expect(by_id("load-external-content")).toBe(null);
    act(() => by_id("image-loading-settings")!.click());
    expect(handlers.on_open_image_settings).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes from the notice row", () => {
    const handlers = render({ unsubscribe_state: "idle" });

    expect(by_id("message-unsubscribe")?.textContent).toBe("mail.unsubscribe");
    act(() => by_id("message-unsubscribe")!.click());
    expect(handlers.on_unsubscribe).toHaveBeenCalledTimes(1);
    expect(handlers.on_open_unsubscribe_page).not.toHaveBeenCalled();
  });

  it("disables unsubscribe while the request runs", () => {
    render({ unsubscribe_state: "loading" });

    expect(by_id("message-unsubscribe")?.disabled).toBe(true);
    expect(by_id("message-unsubscribe")?.getAttribute("aria-busy")).toBe(
      "true",
    );
  });

  it("opens the unsubscribe page when the sender needs it", () => {
    const handlers = render({ unsubscribe_state: "manual" });

    expect(by_id("message-unsubscribe")?.textContent).toBe(
      "mail.open_unsubscribe_page",
    );
    act(() => by_id("message-unsubscribe")!.click());
    expect(handlers.on_open_unsubscribe_page).toHaveBeenCalledTimes(1);
    expect(handlers.on_unsubscribe).not.toHaveBeenCalled();
  });

  it("keeps clicks from toggling the message", () => {
    const parent_click = vi.fn();

    act(() =>
      root.render(
        <div onClick={parent_click}>
          <MessageNoticeRow
            external_action={{ kind: "load", types: ["image"] }}
            unsubscribe_state="idle"
            on_load_external_content={vi.fn()}
            on_open_image_settings={vi.fn()}
            on_open_unsubscribe_page={vi.fn()}
            on_unsubscribe={vi.fn()}
          />
        </div>,
      ),
    );
    act(() => by_id("load-external-content")!.click());
    act(() => by_id("message-unsubscribe")!.click());
    expect(parent_click).not.toHaveBeenCalled();
  });
});
