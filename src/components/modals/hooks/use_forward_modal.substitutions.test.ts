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
import type { Attachment } from "@/components/compose/compose_shared";

import { describe, it, expect } from "vitest";

import {
  apply_inline_image_substitutions,
  merge_pending_recipients,
} from "./use_forward_modal";

const make_att = (overrides: Partial<Attachment>): Attachment => ({
  id: overrides.id || "att1",
  name: overrides.name || "pic.png",
  size: "1 KB",
  size_bytes: overrides.size_bytes ?? 1024,
  mime_type: overrides.mime_type || "image/png",
  data: overrides.data || new Uint8Array([137, 80, 78, 71]).buffer,
  content_id: overrides.content_id,
});

describe("apply_inline_image_substitutions", () => {
  it("replaces cid references with data urls and marks the attachment embedded", () => {
    const att = make_att({ id: "a1", content_id: "logo@x" });
    const { content, embedded_attachment_ids } =
      apply_inline_image_substitutions('<img src="cid:logo@x">', [att]);

    expect(content).toContain('src="data:image/png;base64,');
    expect(content).not.toContain("cid:logo@x");
    expect(embedded_attachment_ids.has("a1")).toBe(true);
  });

  it("matches angle-bracketed and single-quoted cid references", () => {
    const att = make_att({ id: "a1", content_id: "<logo@x>" });
    const { content } = apply_inline_image_substitutions(
      "<img src='cid:logo@x'>",
      [att],
    );

    expect(content).toContain("data:image/png;base64,");
  });

  it("matches entity-escaped content ids", () => {
    const att = make_att({ id: "a1", content_id: "a&b@x" });
    const { content } = apply_inline_image_substitutions(
      '<img src="cid:a&amp;b@x">',
      [att],
    );

    expect(content).toContain("data:image/png;base64,");
  });

  it("leaves cid references intact when the image exceeds the inline budget", () => {
    const att = make_att({
      id: "big",
      content_id: "huge@x",
      size_bytes: 6 * 1024 * 1024,
    });
    const { content, embedded_attachment_ids } =
      apply_inline_image_substitutions('<img src="cid:huge@x">', [att]);

    expect(content).toContain('src="cid:huge@x"');
    expect(embedded_attachment_ids.size).toBe(0);
  });

  it("replaces blob sources positionally with unreferenced inline images", () => {
    const att = make_att({ id: "a1", content_id: "x@y" });
    const { content } = apply_inline_image_substitutions(
      '<img src="blob:http://localhost/abc-123">',
      [att],
    );

    expect(content).toContain("data:image/png;base64,");
    expect(content).not.toContain("blob:");
  });

  it("strips leftover blob sources when no attachment is available", () => {
    const { content } = apply_inline_image_substitutions(
      '<img src="blob:http://localhost/abc-123"><img src="blob:http://localhost/def-456">',
      [],
    );

    expect(content).not.toContain("blob:");
    expect(content).toContain('src=""');
  });

  it("appends unreferenced inline images with escaped alt text", () => {
    const att = make_att({
      id: "a1",
      content_id: "unused@x",
      name: 'we"ird<name>.png',
    });
    const { content } = apply_inline_image_substitutions("<p>hi</p>", [att]);

    expect(content).toContain("data:image/png;base64,");
    expect(content).toContain("we&quot;ird&lt;name&gt;.png");
    expect(content).not.toContain('alt="we"ird');
  });

  it("never embeds svg or malformed mime types", () => {
    const svg = make_att({
      id: "s1",
      content_id: "svg@x",
      mime_type: "image/svg+xml",
    });
    const evil = make_att({
      id: "e1",
      content_id: "evil@x",
      mime_type: 'image/png";x="$&',
    });
    const { content, embedded_attachment_ids } =
      apply_inline_image_substitutions(
        '<img src="cid:svg@x"><img src="cid:evil@x">',
        [svg, evil],
      );

    expect(embedded_attachment_ids.size).toBe(0);
    expect(content).toContain("cid:svg@x");
    expect(content).toContain("cid:evil@x");
    expect(content).not.toContain('x="$&');
  });

  it("does not corrupt content via replacement pattern expansion", () => {
    const att = make_att({ id: "a1", content_id: "d@x" });
    const { content } = apply_inline_image_substitutions(
      '<p>$& $` $\' before</p><img src="cid:d@x">',
      [att],
    );

    expect(content).toContain("<p>$& $` $' before</p>");
  });

  it("stops embedding at the total inline budget but keeps remaining as cid", () => {
    const big_data = new ArrayBuffer(4 * 1024 * 1024);
    const a = make_att({
      id: "a",
      content_id: "a@x",
      size_bytes: 4 * 1024 * 1024,
      data: big_data,
    });
    const b = make_att({
      id: "b",
      content_id: "b@x",
      size_bytes: 4 * 1024 * 1024,
      data: big_data,
    });
    const c = make_att({
      id: "c",
      content_id: "c@x",
      size_bytes: 4 * 1024 * 1024,
      data: big_data,
    });
    const { content, embedded_attachment_ids } =
      apply_inline_image_substitutions(
        '<img src="cid:a@x"><img src="cid:b@x"><img src="cid:c@x">',
        [a, b, c],
      );

    expect(embedded_attachment_ids.size).toBe(2);
    expect(content).toContain('src="cid:c@x"');
  });
});

describe("merge_pending_recipients", () => {
  it("includes an address typed but not committed", () => {
    const merged = merge_pending_recipients(
      { to: [], cc: [], bcc: [] },
      { to: "  someone@example.com  ", cc: "", bcc: "" },
    );

    expect(merged.to).toEqual(["someone@example.com"]);
    expect(merged.cc).toEqual([]);
    expect(merged.bcc).toEqual([]);
  });

  it("keeps committed recipients and appends pending cc and bcc", () => {
    const merged = merge_pending_recipients(
      { to: ["a@example.com"], cc: [], bcc: [] },
      { to: "", cc: "b@example.com", bcc: "c@example.com" },
    );

    expect(merged.to).toEqual(["a@example.com"]);
    expect(merged.cc).toEqual(["b@example.com"]);
    expect(merged.bcc).toEqual(["c@example.com"]);
  });

  it("does not duplicate an address that is already committed", () => {
    const merged = merge_pending_recipients(
      { to: ["A@Example.com"], cc: [], bcc: [] },
      { to: "a@example.com", cc: "", bcc: "" },
    );

    expect(merged.to).toEqual(["A@Example.com"]);
  });
});
