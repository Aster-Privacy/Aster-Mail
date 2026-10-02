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
import { describe, expect, it, vi } from "vitest";

import { unblock_remote_content } from "./dom_cleanup";

import { pre_process_email_html } from "@/components/email/email_pre_process";

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct" },
}));

vi.mock("./helpers", () => ({
  IMAGE_PROXY_URL: "/api/images/v1/proxy",
}));

const proxy = "/api/images/v1/proxy";
const original = "https://images.example.test/logo.png?size=small&format=png";

describe("legacy blocked image loading", () => {
  it.each(["preprocessor", "renderer"] as const)(
    "reconstructs the configured proxy URL in the %s regardless of placeholder proxy metadata",
    (path) => {
      const doc = document.implementation.createHTMLDocument("");
      const placeholder = doc.createElement("span");

      placeholder.className = "blocked-image";
      placeholder.setAttribute("data-original-src", original);
      placeholder.setAttribute(
        "data-proxy-src",
        "https://other.example.test/direct.png",
      );
      placeholder.setAttribute("data-width", "162");
      placeholder.setAttribute("data-height", "32");
      doc.body.appendChild(placeholder);

      let loaded: Document;

      if (path === "preprocessor") {
        const html = pre_process_email_html(doc.body.innerHTML, {
          forwarded_label: "Forwarded message",
          show_trimmed_label: "Show trimmed content",
          preserve_formatting: true,
          load_remote_content: true,
          proxy_base: proxy,
        });

        loaded = new DOMParser().parseFromString(html, "text/html");
      } else {
        unblock_remote_content(doc);
        loaded = doc;
      }

      const img = loaded.querySelector("img")!;

      expect(img.getAttribute("src")).toBe(
        `${proxy}?url=${encodeURIComponent(original)}`,
      );
      expect(img.getAttribute("width")).toBe("162");
      expect(img.getAttribute("height")).toBe("32");
      expect(loaded.querySelector("span.blocked-image")).toBeNull();
    },
  );
});
