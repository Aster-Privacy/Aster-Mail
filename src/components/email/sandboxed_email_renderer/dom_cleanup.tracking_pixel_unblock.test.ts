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
  connection_store: { get_method: () => "direct", subscribe: () => () => {} },
}));

vi.mock("./helpers", () => ({
  IMAGE_PROXY_URL: "/api/images/v1/proxy",
}));

const proxy = "/api/images/v1/proxy";
const pixel = "https://trk.example.test/open/abc.gif";
const photo = "https://images.example.test/photo.png";

function blocked_doc(): Document {
  const doc = document.implementation.createHTMLDocument("");

  doc.body.innerHTML = [
    `<img data-blocked="true" data-tracking-pixel="true" data-original-src="${pixel}" data-proxy-src="${proxy}?url=${encodeURIComponent(pixel)}" width="1" height="1">`,
    `<img data-blocked="true" data-original-src="${photo}" data-proxy-src="${proxy}?url=${encodeURIComponent(photo)}" alt="Photo">`,
  ].join("");

  return doc;
}

describe("loading remote content keeps tracking pixels blocked", () => {
  it.each(["preprocessor", "renderer"] as const)(
    "loads the photo but not the pixel in the %s",
    (path) => {
      const doc = blocked_doc();
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

      const tracker = loaded.querySelector("img[data-tracking-pixel='true']");

      expect(
        loaded.querySelector("img[alt='Photo']")!.getAttribute("src"),
      ).toContain(`${proxy}?url=${encodeURIComponent(photo)}`);
      expect(tracker).not.toBeNull();
      expect(tracker!.getAttribute("src")).toBeNull();
      expect(tracker!.getAttribute("data-blocked")).toBe("true");
    },
  );
});
