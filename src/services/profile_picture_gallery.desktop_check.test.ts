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
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct" },
}));

import { gallery_full_url, gallery_thumb_url } from "./profile_picture_gallery";

const globals = window as unknown as Record<string, unknown>;
const window_chain = Object.getPrototypeOf(window) as object;

function expose_on_window_chain(element: HTMLElement): void {
  document.body.appendChild(element);
  const named_value =
    element instanceof HTMLIFrameElement ? element.contentWindow : element;

  Object.defineProperty(window_chain, "__TAURI_INTERNALS__", {
    configurable: true,
    get: () => named_value,
  });
}

afterEach(() => {
  delete globals.__TAURI_INTERNALS__;
  Reflect.deleteProperty(window_chain, "__TAURI_INTERNALS__");
  document.body.innerHTML = "";
});

describe("gallery base desktop check", () => {
  it("serves from the app origin when a page element is named after the desktop global", () => {
    const anchor = document.createElement("a");

    anchor.setAttribute("name", "__TAURI_INTERNALS__");
    expose_on_window_chain(anchor);

    expect(gallery_thumb_url("aurora_01")).toBe(
      "/gallery/thumb/aurora_01.webp",
    );
    expect(gallery_full_url("aurora_01")).toBe("/gallery/full/aurora_01.webp");
  });

  it("serves from the app origin when a frame is named after the desktop global", () => {
    const frame = document.createElement("iframe");

    frame.setAttribute("name", "__TAURI_INTERNALS__");
    expose_on_window_chain(frame);

    expect(gallery_thumb_url("aurora_01")).toBe(
      "/gallery/thumb/aurora_01.webp",
    );
  });

  it("uses the hosted gallery inside the desktop runtime", () => {
    globals.__TAURI_INTERNALS__ = { invoke: () => undefined };

    expect(gallery_thumb_url("aurora_01")).toBe(
      "https://app.astermail.org/gallery/thumb/aurora_01.webp",
    );
  });
});
