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
import type { ImageViewerRequest } from "@/lib/email_image_viewer";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  save_viewer_image: vi.fn(async (_src: string) => {}),
  show_toast: vi.fn(),
}));

vi.mock("@/lib/use_dialog_shell", () => ({
  use_dialog_shell: () => ({
    layer_id: "image_preview",
    dialog_ref: { current: null },
    handle_backdrop_pointer_down: () => {},
  }),
}));

vi.mock("@/lib/overlay_layer_stack", () => ({
  is_top_overlay_layer: () => true,
}));

vi.mock("@/lib/email_image_actions", () => ({
  save_viewer_image: h.save_viewer_image,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: h.show_toast,
}));

import { EmailImageViewer } from "./email_image_viewer_modal";

const t = (key: string) => key;

function proxied(name: string): string {
  return `${window.location.origin}/api/images/v1/proxy?url=${encodeURIComponent(`https://cdn.example.com/${name}.png`)}`;
}

let container: HTMLDivElement;
let root: Root;
let changes: (ImageViewerRequest | null)[];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  changes = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function render(request: ImageViewerRequest): void {
  act(() => {
    root.render(
      <EmailImageViewer
        on_change={(next) => {
          changes.push(next);
        }}
        request={request}
        t={t}
      />,
    );
  });
}

function by_id(test_id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${test_id}"]`);
}

function press(test_id: string): void {
  act(() => {
    by_id(test_id)!.click();
  });
}

function key(value: string): void {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

const gallery: ImageViewerRequest = {
  items: [
    { src: proxied("a"), alt: "First image" },
    { src: proxied("b"), alt: "" },
    { src: proxied("c"), alt: "Third" },
  ],
  index: 0,
};

describe("email image viewer", () => {
  it("shows the rendered source with its alt text as the caption", () => {
    render(gallery);

    const image = by_id("image_preview_image") as HTMLImageElement;
    const dialog = by_id("image_preview_modal")!;
    const caption = by_id("image_preview_caption")!;

    expect(image.getAttribute("src")).toBe(proxied("a"));
    expect(image.getAttribute("alt")).toBe("First image");
    expect(caption.textContent).toBe("First image");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-describedby")).toBe(caption.id);
    expect(container.textContent).toContain("1 / 3");
  });

  it("labels every control", () => {
    render(gallery);

    for (const test_id of [
      "image_preview_zoom_in",
      "image_preview_zoom_out",
      "image_preview_zoom_reset",
      "image_preview_download",
      "image_preview_close",
      "image_preview_prev",
      "image_preview_next",
    ]) {
      expect(by_id(test_id)?.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("moves between images with the arrow keys and wraps around", () => {
    render(gallery);
    key("ArrowRight");
    key("ArrowLeft");

    expect(changes.map((next) => next?.index)).toEqual([1, 2]);
  });

  it("moves between images with the buttons", () => {
    render({ ...gallery, index: 2 });
    press("image_preview_next");
    press("image_preview_prev");

    expect(changes.map((next) => next?.index)).toEqual([0, 1]);
  });

  it("hides navigation for a single image", () => {
    render({ items: [gallery.items[0]], index: 0 });

    expect(by_id("image_preview_prev")).toBeNull();
    expect(by_id("image_preview_next")).toBeNull();
    expect(container.textContent).not.toContain("1 / 1");
  });

  it("zooms in and back to fit with the buttons and keys", () => {
    render(gallery);

    const reset = by_id("image_preview_zoom_reset")!;
    const zoom_out = by_id("image_preview_zoom_out") as HTMLButtonElement;

    expect(reset.textContent).toBe("100%");
    expect(zoom_out.disabled).toBe(true);

    press("image_preview_zoom_in");
    expect(reset.textContent).toBe("150%");
    expect(zoom_out.disabled).toBe(false);

    key("+");
    expect(reset.textContent).toBe("225%");

    key("-");
    expect(reset.textContent).toBe("150%");

    press("image_preview_zoom_reset");
    expect(reset.textContent).toBe("100%");

    press("image_preview_zoom_in");
    key("0");
    expect(reset.textContent).toBe("100%");
  });

  it("toggles zoom on double-click", () => {
    render(gallery);

    const image = by_id("image_preview_image")!;

    act(() => {
      image.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, clientX: 0, clientY: 0 }),
      );
    });
    expect(by_id("image_preview_zoom_reset")!.textContent).toBe("250%");

    act(() => {
      image.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(by_id("image_preview_zoom_reset")!.textContent).toBe("100%");
  });

  it("closes the viewer and then follows the link from Open link", () => {
    const order: string[] = [];
    const open_link = vi.fn(() => order.push("link"));

    render({
      items: [{ src: proxied("a"), alt: "", open_link }],
      index: 0,
    });

    act(() => {
      root.render(
        <EmailImageViewer
          on_change={(next) => {
            order.push(next === null ? "close" : "change");
          }}
          request={{
            items: [{ src: proxied("a"), alt: "", open_link }],
            index: 0,
          }}
          t={t}
        />,
      );
    });
    press("image_preview_open_link");

    expect(order).toEqual(["close", "link"]);
  });

  it("leaves out Open link for an unlinked image", () => {
    render(gallery);

    expect(by_id("image_preview_open_link")).toBeNull();
  });

  it("saves the image that is on screen", () => {
    render({ ...gallery, index: 2 });
    press("image_preview_download");

    expect(h.save_viewer_image).toHaveBeenCalledWith(proxied("c"));
  });

  it("closes from the close button and from the empty stage", () => {
    render(gallery);
    press("image_preview_close");
    press("image_preview_stage");

    expect(changes).toEqual([null, null]);
  });

  it("stays open when the image itself is clicked", () => {
    render(gallery);
    press("image_preview_image");

    expect(changes).toEqual([]);
  });
});
