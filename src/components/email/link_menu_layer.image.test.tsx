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
import type { ReactNode } from "react";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  handle_external_link: vi.fn(),
  copy_text: vi.fn(async (_value: string) => true),
  copy_viewer_image: vi.fn(async (_src: string) => {}),
  save_viewer_image: vi.fn(async (_src: string) => {}),
  show_toast: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => {
  const t = (key: string) => key;

  return { use_i18n: () => ({ t }) };
});

vi.mock("@/contexts/external_link_context", () => ({
  use_external_link: () => ({ handle_external_link: h.handle_external_link }),
}));

vi.mock("@/utils/copy_text", () => ({ copy_text: h.copy_text }));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: h.show_toast,
}));

vi.mock("@/lib/email_image_actions", () => ({
  copy_viewer_image: h.copy_viewer_image,
  save_viewer_image: h.save_viewer_image,
}));

vi.mock("@/components/ui/dropdown_menu", () => ({
  DropdownMenu: ({
    children,
    open,
    onOpenChange,
  }: {
    children: ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div>
        <button
          data-testid="dismiss"
          type="button"
          onClick={() => onOpenChange(false)}
        />
        {children}
      </div>
    ) : null,
  DropdownMenuTrigger: () => null,
  DropdownMenuContent: ({
    children,
    "data-testid": test_id,
  }: {
    children: ReactNode;
    "data-testid"?: string;
  }) => (
    <div data-testid={test_id} role="menu">
      {children}
    </div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    "data-testid": test_id,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    "data-testid"?: string;
  }) => (
    <button
      data-testid={test_id}
      role="menuitem"
      type="button"
      onClick={onSelect}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => null,
}));

import { LinkMenuLayer } from "./link_menu_layer";

import { LINK_MENU_EVENT, type LinkMenuDetail } from "@/lib/link_menu_event";

const SRC = `${window.location.origin}/api/images/v1/proxy?url=https%3A%2F%2Fcdn.example.com%2Fhero.png`;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<LinkMenuLayer />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function open_menu(detail: LinkMenuDetail): void {
  act(() => {
    window.dispatchEvent(new CustomEvent(LINK_MENU_EVENT, { detail }));
  });
}

function item_ids(): string[] {
  return Array.from(container.querySelectorAll('[role="menuitem"]')).map(
    (item) => item.getAttribute("data-testid") ?? "",
  );
}

async function press(test_id: string): Promise<void> {
  await act(async () => {
    (
      container.querySelector(`[data-testid="${test_id}"]`) as HTMLElement
    ).click();
  });
}

describe("image context menu", () => {
  it("lists view, link, and image actions for a linked image", () => {
    open_menu({
      url: "https://track.example.com/c",
      x: 10,
      y: 20,
      image: { src: SRC, on_view: vi.fn() },
    });

    expect(
      container.querySelector('[data-testid="image_menu"]'),
    ).not.toBeNull();
    expect(item_ids()).toEqual([
      "image_menu_view",
      "link_menu_open",
      "link_menu_copy",
      "image_menu_copy",
      "image_menu_save",
    ]);
    expect(container.textContent).toContain("mail.image_menu_copy_link");
    expect(
      container.querySelector('[data-testid="link_menu_preview"]'),
    ).toBeNull();
  });

  it("lists only image actions for an unlinked image", () => {
    open_menu({ x: 10, y: 20, image: { src: SRC, on_view: vi.fn() } });

    expect(item_ids()).toEqual([
      "image_menu_view",
      "image_menu_copy",
      "image_menu_save",
    ]);
  });

  it("drops a link that is not a web page", () => {
    open_menu({
      url: "javascript:alert(1)",
      x: 10,
      y: 20,
      image: { src: SRC, on_view: vi.fn() },
    });

    expect(item_ids()).not.toContain("link_menu_open");
  });

  it("opens the viewer from View Image", async () => {
    const on_view = vi.fn();

    open_menu({ x: 10, y: 20, image: { src: SRC, on_view } });
    await press("image_menu_view");

    expect(on_view).toHaveBeenCalledTimes(1);
  });

  it("sends Open Link through the external link warning", async () => {
    open_menu({
      url: "https://track.example.com/c",
      x: 10,
      y: 20,
      image: { src: SRC, on_view: vi.fn() },
    });
    await press("link_menu_open");

    expect(h.handle_external_link).toHaveBeenCalledWith(
      "https://track.example.com/c",
    );
  });

  it("copies the link address", async () => {
    open_menu({
      url: "https://track.example.com/c",
      x: 10,
      y: 20,
      image: { src: SRC, on_view: vi.fn() },
    });
    await press("link_menu_copy");

    expect(h.copy_text).toHaveBeenCalledWith("https://track.example.com/c");
  });

  it("copies and saves the image from the loaded source", async () => {
    open_menu({ x: 10, y: 20, image: { src: SRC, on_view: vi.fn() } });
    await press("image_menu_copy");

    expect(h.copy_viewer_image).toHaveBeenCalledWith(SRC);
    expect(h.show_toast).toHaveBeenCalledWith("mail.image_copied", "success");

    open_menu({ x: 10, y: 20, image: { src: SRC, on_view: vi.fn() } });
    await press("image_menu_save");

    expect(h.save_viewer_image).toHaveBeenCalledWith(SRC);
  });

  it("reports a failed copy or save", async () => {
    h.copy_viewer_image.mockRejectedValueOnce(new Error("denied"));
    h.save_viewer_image.mockRejectedValueOnce(new Error("offline"));

    open_menu({ x: 10, y: 20, image: { src: SRC, on_view: vi.fn() } });
    await press("image_menu_copy");
    open_menu({ x: 10, y: 20, image: { src: SRC, on_view: vi.fn() } });
    await press("image_menu_save");

    expect(h.show_toast).toHaveBeenCalledWith(
      "mail.image_copy_failed",
      "error",
    );
    expect(h.show_toast).toHaveBeenCalledWith(
      "mail.image_save_failed",
      "error",
    );
  });

  it("keeps the plain link menu for links without an image", () => {
    open_menu({ url: "https://example.com/page", x: 10, y: 20 });

    expect(container.querySelector('[data-testid="link_menu"]')).not.toBeNull();
    expect(item_ids()).toEqual(["link_menu_open", "link_menu_copy"]);
    expect(container.textContent).toContain("mail.link_menu_copy");
  });

  it("closes when dismissed", async () => {
    open_menu({ x: 10, y: 20, image: { src: SRC, on_view: vi.fn() } });
    await press("dismiss");

    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});
