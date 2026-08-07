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
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ExternalContentBanner } from "@/components/email/external_content_banner";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/external_link_context", () => ({
  use_external_link: () => ({ handle_external_link: vi.fn() }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const blocked_content: ExternalContentReport = {
  has_remote_images: true,
  has_remote_fonts: false,
  has_remote_css: false,
  has_tracking_pixels: false,
  blocked_count: 1,
  blocked_items: [{ url: "https://example.test/pixel.png", type: "image" }],
  cleaned_links: [],
};

let container: HTMLDivElement;
let root: Root;

function set_document_hidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
}

function details_button(): HTMLButtonElement {
  const button = container.querySelector("button[aria-expanded]");

  if (!button) throw new Error("details button not found");

  return button as HTMLButtonElement;
}

function render_banner() {
  act(() => {
    root.render(
      <ExternalContentBanner
        blocked_content={blocked_content}
        on_dismiss={vi.fn()}
        on_load={vi.fn()}
      />,
    );
  });
}

function open_details() {
  act(() => {
    details_button().click();
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  set_document_hidden(false);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  set_document_hidden(false);
});

describe("ExternalContentBanner blur dismissal", () => {
  it("stays open when the window loses focus but the page is still visible", () => {
    render_banner();
    open_details();

    expect(details_button().getAttribute("aria-expanded")).toBe("true");

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(details_button().getAttribute("aria-expanded")).toBe("true");
  });

  it("closes when the page is actually hidden", () => {
    render_banner();
    open_details();

    expect(details_button().getAttribute("aria-expanded")).toBe("true");

    set_document_hidden(true);

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(details_button().getAttribute("aria-expanded")).toBe("false");
  });
});
