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
//
import { describe, expect, it, vi } from "vitest";

import { unblock_remote_content } from "./dom_cleanup";

import {
  DEFERRED_IMAGE_PLACEHOLDER,
  proxied_image_target,
} from "@/lib/deferred_proxy_images";

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct", subscribe: () => () => {} },
}));

vi.mock("./helpers", () => ({
  IMAGE_PROXY_URL: "/api/images/v1/proxy",
}));

vi.mock("@/lib/image_proxy_grant", () => ({
  fetch_proxied_image: vi.fn(),
}));

const proxy = "/api/images/v1/proxy";
const original = "https://images.example.test/logo.png?size=small";

function blocked_document(): Document {
  const doc = document.implementation.createHTMLDocument("");
  const img = doc.createElement("img");

  img.id = "blocked";
  img.setAttribute("data-blocked", "true");
  img.setAttribute("data-original-src", original);
  doc.body.appendChild(img);

  const placeholder = doc.createElement("span");

  placeholder.className = "blocked-image";
  placeholder.setAttribute("data-original-src", original);
  placeholder.setAttribute("data-width", "162");
  placeholder.setAttribute("data-height", "32");
  doc.body.appendChild(placeholder);

  return doc;
}

describe("unblocking remote images", () => {
  it("points images at the proxy directly by default", () => {
    const doc = blocked_document();

    unblock_remote_content(doc);

    const images = Array.from(doc.querySelectorAll("img"));

    expect(images).toHaveLength(2);
    images.forEach((img) => {
      expect(
        proxied_image_target(img.getAttribute("src"), proxy),
      ).not.toBeNull();
      expect(img.hasAttribute("data-deferred-src")).toBe(false);
    });
  });

  it("leaves no live proxy source when loading is deferred", () => {
    const doc = blocked_document();

    unblock_remote_content(doc, { defer_proxied: true });

    const images = Array.from(doc.querySelectorAll("img"));

    expect(images).toHaveLength(2);
    images.forEach((img) => {
      expect(img.getAttribute("src")).toBe(DEFERRED_IMAGE_PLACEHOLDER);

      const target = proxied_image_target(
        img.getAttribute("data-deferred-src"),
        proxy,
      );

      expect(target).not.toBeNull();
      expect(new URL(target || "").searchParams.get("url")).toBe(original);
    });
  });
});
