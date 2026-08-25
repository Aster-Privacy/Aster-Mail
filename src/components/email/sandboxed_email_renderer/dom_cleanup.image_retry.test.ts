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
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct" },
}));

vi.mock("./helpers", () => ({ IMAGE_PROXY_URL: "" }));

import { unblock_remote_content } from "./dom_cleanup";
import { IMAGE_LOAD_RETRY_MAX_ATTEMPTS } from "@/lib/image_load_retry";

const REMOTE = "https://cdn.example.com/newsletter/hero.png";

function build(): { doc: Document; img: HTMLImageElement } {
  const doc = document.implementation.createHTMLDocument("");

  doc.body.innerHTML = `<img data-blocked="true" data-proxy-src="${REMOTE}" alt="[Click to load image]">`;

  const img = doc.querySelector("img") as HTMLImageElement;

  return { doc, img };
}

function fail_once(img: HTMLImageElement) {
  img.dispatchEvent(new Event("error"));
}

describe("unblocked remote images survive a transient load failure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries the same source instead of hiding the image", () => {
    const { doc, img } = build();

    unblock_remote_content(doc);
    fail_once(img);

    expect(img.getAttribute("src")).toBe(null);
    expect(img.style.display).not.toBe("none");

    vi.runAllTimers();

    expect(img.getAttribute("src")).toBe(REMOTE);
    expect(img.style.display).not.toBe("none");
  });

  it("gives up only after the retry budget is spent", () => {
    const { doc, img } = build();

    unblock_remote_content(doc);

    for (let attempt = 0; attempt < IMAGE_LOAD_RETRY_MAX_ATTEMPTS; attempt++) {
      fail_once(img);
      vi.runAllTimers();
    }

    expect(img.getAttribute("data-load-failed")).toBe(null);

    fail_once(img);

    expect(img.getAttribute("data-load-failed")).toBe("true");
    expect(img.style.display).toBe("none");
  });

  it("keeps an image with sender alt text visible after a final failure", () => {
    const doc = document.implementation.createHTMLDocument("");

    doc.body.innerHTML = `<img data-blocked="true" data-proxy-src="${REMOTE}" alt="Quarterly chart">`;

    const img = doc.querySelector("img") as HTMLImageElement;

    unblock_remote_content(doc);

    for (let attempt = 0; attempt <= IMAGE_LOAD_RETRY_MAX_ATTEMPTS; attempt++) {
      fail_once(img);
      vi.runAllTimers();
    }

    expect(img.getAttribute("data-load-failed")).toBe("true");
    expect(img.style.display).not.toBe("none");
  });
});
