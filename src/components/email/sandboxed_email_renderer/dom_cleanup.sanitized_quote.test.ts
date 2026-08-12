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
import { describe, expect, it } from "vitest";

import { sanitize_html } from "@/lib/html_sanitizer";

import {
  collapse_empty_block_runs,
  collapse_forwarded_content,
  collapse_quoted_replies,
} from "./dom_cleanup";

type translate_fn = Parameters<typeof collapse_forwarded_content>[1];

const t = ((key: string) =>
  key === "common.forwarded_message"
    ? "Forwarded message"
    : "Show trimmed content") as unknown as translate_fn;

const proton_forward = `<div style="font-family: Arial, sans-serif;">FYI.</div>
<div style="font-family: Arial, sans-serif;"><br></div>
<div class="protonmail_signature_block" style="font-family: Arial, sans-serif;"><div class="protonmail_signature_block-user">Sent from Proton Mail for iOS.</div></div>
<div class="protonmail_quote">-------- Original Message --------<br>
On Wednesday, 08/12/26 at 08:50, Mr Yes &lt;mryes@gmail.com&gt; wrote:<br><br>
<blockquote class="protonmail_quote" type="cite">Test</blockquote></div>`;

function render_like_viewer(raw_html: string): Document {
  const sanitized = sanitize_html(raw_html, {
    external_content_mode: "never",
    sandbox_mode: true,
  });
  const doc = document.implementation.createHTMLDocument("");

  doc.body.innerHTML = sanitized.html;

  collapse_forwarded_content(doc, t);
  collapse_quoted_replies(doc, t);
  collapse_empty_block_runs(doc);

  return doc;
}

describe("sanitized proton forward through the viewer pipeline", () => {
  it("keeps the quote class the collapse depends on", () => {
    const sanitized = sanitize_html(proton_forward, {
      external_content_mode: "never",
      sandbox_mode: true,
    });

    expect(sanitized.html).toContain("protonmail_quote");
  });

  it("shows only the sender's own text and hides the original below the toggle", () => {
    const doc = render_like_viewer(proton_forward);
    const details = doc.body.querySelector("details.aster-forwarded-collapse");
    const visible = doc.body.cloneNode(true) as HTMLElement;

    visible
      .querySelectorAll("details.aster-forwarded-collapse")
      .forEach((el) => el.remove());

    expect(details).not.toBeNull();
    expect(visible.textContent).toContain("FYI.");
    expect(visible.textContent).not.toContain("Test");
    expect(details?.textContent).toContain("Original Message");
    expect(details?.textContent).toContain("Test");
    expect(details?.querySelector("blockquote")?.textContent).toBe("Test");
    expect(details?.hasAttribute("open")).toBe(false);
  });
});
